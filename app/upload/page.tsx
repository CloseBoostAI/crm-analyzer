'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRouter } from 'next/navigation';
import { saveDeals, saveCustomers, saveLogs, loadDeals, loadCustomers } from '@/lib/supabase/data';
import { TARGET_FIELDS, tryAutoMap, applyMapping, type ColumnMapping } from '@/lib/column-mapper';
import { UNIVERSAL_DEAL_STAGES, DEFAULT_DEAL_STAGE_KEYS, getDealStageLabel } from '@/lib/utils';

function DealStageOptions() {
  const stages = DEFAULT_DEAL_STAGE_KEYS
    .map((k) => UNIVERSAL_DEAL_STAGES.find((s) => s.key === k))
    .filter(Boolean) as typeof UNIVERSAL_DEAL_STAGES;
  return (
    <>
      {stages.map((s) => (
        <option key={s.key} value={s.label}>{s.label}</option>
      ))}
    </>
  );
}

function mapDealStageToStatus(dealStage: string): 'Active' | 'Inactive' | 'Lead' | 'Opportunity' {
  const stage = dealStage.toLowerCase();
  if (stage.includes('won')) return 'Active';
  if (stage.includes('lost')) return 'Inactive';
  if (stage.includes('appointment') || stage.includes('proposal')) return 'Lead';
  return 'Opportunity';
}

function parseCSVText(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentValue.trim());
      currentValue = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(currentValue.trim());
      if (row.length > 0) result.push(row);
      row = [];
      currentValue = '';
    } else if (char === '\r') {
      continue;
    } else {
      currentValue += char;
    }
  }

  if (currentValue.trim()) row.push(currentValue.trim());
  if (row.length > 0) result.push(row);
  return result;
}

/** Fix common CSV export bug: header merged with first data row (e.g. "Notes NovaTech" instead of "Notes" + "NovaTech Solutions") */
function fixMergedHeader(parsedLines: string[][]): string[][] {
  if (parsedLines.length < 2) return parsedLines;
  const headers = parsedLines[0];
  const lastHeader = headers[headers.length - 1] || '';
  const match = lastHeader.match(/^Notes\s+(.+)$/);
  if (match) {
    const companyStart = match[1].trim();
    const firstRow = parsedLines[1];
    if (firstRow?.length > 0 && companyStart) {
      headers[headers.length - 1] = 'Notes';
      firstRow[0] = `${companyStart} ${firstRow[0] || ''}`.trim();
    }
  }
  return parsedLines;
}

/** Merge rows broken by unquoted newlines. Short rows: first value → previous last field; last value merges with next row's first. */
function mergeBrokenRows(parsedLines: string[][]): string[][] {
  if (parsedLines.length < 2) return parsedLines;
  const headers = parsedLines[0];
  const expectedCols = headers.length;
  const dataRows = parsedLines.slice(1);
  const result: string[][] = [];
  let buffer: string[] = [];
  let pendingMerge: string | null = null;

  for (let i = 0; i < dataRows.length; i++) {
    let row = [...dataRows[i]];
    if (pendingMerge) {
      row[0] = `${pendingMerge} ${row[0] || ''}`.trim();
      pendingMerge = null;
    }

    if (row.length < expectedCols && result.length > 0 && buffer.length === 0) {
      const last = result[result.length - 1];
      last[last.length - 1] = `${last[last.length - 1] || ''} ${row[0] || ''}`.trim();
      if (row.length > 1) {
        pendingMerge = row[row.length - 1];
        buffer = row.slice(1, -1);
      }
    } else {
      buffer = buffer.length ? [...buffer, ...row] : [...row];
    }

    while (buffer.length >= expectedCols) {
      result.push(buffer.splice(0, expectedCols));
    }
  }

  if (buffer.length > 0) result.push(buffer);
  return [headers, ...result];
}

function parseFileContent(content: string): { headers: string[]; rows: string[][] } {
  const trimmed = content.trim();
  let parsedLines: string[][] = [];

  try {
    const jsonData = JSON.parse(trimmed);
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const headers = Object.keys(jsonData[0]);
      parsedLines = [
        headers,
        ...jsonData.map((item: Record<string, unknown>) =>
          headers.map(h => {
            const value = item[h];
            return value !== null && value !== undefined ? String(value) : '';
          })
        ),
      ];
    }
  } catch {
    parsedLines = parseCSVText(trimmed);
    parsedLines = fixMergedHeader(parsedLines);
    parsedLines = mergeBrokenRows(parsedLines);
  }

  if (parsedLines.length < 2) {
    throw new Error('Invalid format or empty content');
  }

  const headers = parsedLines[0].map(h => h.replace(/^"/, '').replace(/"$/, ''));
  return { headers, rows: parsedLines.slice(1) };
}

interface DealFormData {
  recordId: string;
  dealName: string;
  company: string;
  contact: string;
  email: string;
  dealStage: string;
  dealOwner: string;
  amount: string;
  lastActivity: string;
  associatedNote: string;
  closeDate: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const emptyDeal: DealFormData = { recordId: '', dealName: '', company: '', contact: '', email: '', dealStage: '', dealOwner: '', amount: '', lastActivity: '', associatedNote: '', closeDate: '' };
  const [manualDeals, setManualDeals] = useState<DealFormData[]>([{ ...emptyDeal }]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mappingStep, setMappingStep] = useState(false);
  const [uploadStep, setUploadStep] = useState<'columns'>('columns');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'application/json': ['.json'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
  });

  const processContent = async (content: string, mergeWithExisting = false) => {
    setUploading(true);
    setProgress(0);

    try {
      setProgress(10);
      const combinedContent = content.trim();
      console.log('Raw CRM Data:', combinedContent);

      let parsedLines: string[][] = [];
      let isJSON = false;

      try {
        const jsonData = JSON.parse(combinedContent);
        if (Array.isArray(jsonData) && jsonData.length > 0) {
          isJSON = true;
          const headers = Object.keys(jsonData[0]);
          parsedLines = [headers, ...jsonData.map(item => headers.map(h => {
            const value = item[h];
            return value !== null && value !== undefined ? String(value) : '';
          }))];
        }
      } catch (e) {
        // Not JSON, continue with CSV parsing
      }

      if (!isJSON) {
        setProgress(20);
        parsedLines = parseCSVText(combinedContent);
        parsedLines = fixMergedHeader(parsedLines);
        parsedLines = mergeBrokenRows(parsedLines);
        if (parsedLines.length < 2) {
          throw new Error('Invalid CSV format or empty content');
        }
      }

      if (parsedLines.length < 2) {
        throw new Error('Invalid format or empty content');
      }

      const headers = parsedLines[0].map(h => h.replace(/^"/, '').replace(/"$/, ''));
      
      const isDealsCSV = headers.includes('Record ID') && (headers.includes('Deal Name') || headers.includes('Company') || headers.includes('Contact'));
      
      if (isDealsCSV) {
        const strip = (s: string) => (s || '').replace(/^"/, '').replace(/"$/, '');
        const deals = parsedLines.slice(1)
          .map(values => {
            const record = headers.reduce((obj: any, header, index) => {
              obj[header] = values[index] || '';
              return obj;
            }, {});

            const parsedAmount = parseFloat(strip(record['Amount'])) || 0;

            const dealName = strip(record['Deal Name'] || '');
            const company = strip(record['Company'] || '');
            const contact = strip(record['Contact'] || '');
            const name = dealName || company || contact;

            const rawId = strip(record['Record ID']);
            const id = rawId || 'deal_' + Math.random().toString(36).substr(2, 9);

            const deal = {
              id,
              name,
              stage: strip(record['Deal Stage']),
              owner: strip(record['Deal owner']),
              contact,
              amount: parsedAmount,
              contactId: '',
              notes: strip(record['Associated Note']),
              closeDate: strip(record['Close Date']),
              lastActivity: strip(record['Last Activity'] || ''),
            };

            const customer = {
              id,
              name: contact || dealName || company,
              email: strip(record['Email'] || ''),
              company: company || dealName,
            lastContact: strip(record['Close Date']),
            status: mapDealStageToStatus(strip(record['Deal Stage'])),
            value: parsedAmount,
            customerIntent: 'Shipping Services',
            nextAction: `Follow up with ${strip(record['Deal owner'])} regarding ${strip(record['Deal Stage'])}`,
            notes: [strip(record['Associated Note'])],
            interactions: [{
              timestamp: strip(record['Close Date']),
              type: strip(record['Deal Stage']),
              notes: strip(record['Associated Note']),
              outcome: ''
            }]
          };

          return { deal, customer };
          })
          .filter(({ deal }) => deal.id || deal.name || deal.company || deal.contact);

        const dealsOnly = deals.map(d => ({
          ...d.deal,
          email: d.customer.email || '',
          company: d.customer.company || d.deal.name,
        }));
        const customersOnly = deals.map(d => d.customer);
        const logsOnly = customersOnly.flatMap(customer =>
          customer.interactions.map(i => ({ ...i, customerId: customer.id }))
        );

        setProgress(70);
        let finalDeals = dealsOnly;
        let finalCustomers = customersOnly as any;
        if (mergeWithExisting) {
          const existingDeals = await loadDeals();
          const existingCustomers = await loadCustomers();
          const dealsById = new Map(existingDeals.map((d) => [d.id, d]));
          const customersById = new Map(existingCustomers.map((c) => [c.id, c]));
          for (const d of dealsOnly) dealsById.set(d.id, d);
          for (const c of customersOnly) customersById.set(c.id, c);
          finalDeals = Array.from(dealsById.values());
          finalCustomers = Array.from(customersById.values());
        }
        await saveDeals(finalDeals);
        await saveCustomers(finalCustomers);
        await saveLogs(logsOnly);

        setProgress(100);
        toast.success('Deals and customer data processed successfully');
        setFiles([]);
        setManualDeals([{ ...emptyDeal }]);
        
        setTimeout(() => {
          router.push('/analytics');
          router.refresh();
        }, 1000);
        return;
      }

      const records = parsedLines.slice(1).map(values => {
        const record = headers.reduce((obj: any, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {});

        return record;
      });

      const processedData = records.map(record => {
        const formatDate = (dateStr: string) => {
          try {
            const [month, day, year] = dateStr.split('/');
            return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString().split('T')[0];
          } catch (e) {
            return new Date().toISOString().split('T')[0];
          }
        };

        const formatValue = (amount: string) => {
          const numericValue = parseFloat(amount.replace(/[^0-9.-]+/g, ''));
          return isNaN(numericValue) ? 0 : numericValue;
        };

        return {
          id: 'cust_' + Math.random().toString(36).substr(2, 9),
          name: record['Point of Contact'],
          email: '',
          phone: '',
          company: record['Deal Name'],
          lastContact: formatDate(record['Close Date']),
          status: mapDealStageToStatus(record['Deal Stage'] || ''),
          value: formatValue(record['Amount']),
          customerIntent: record['Service of Interest'],
          nextAction: `Follow up regarding ${formatDate(record['Close Date'])}`,
          notes: [],
          interactions: [{
            timestamp: formatDate(record['Close Date']),
            type: record['Deal Stage'] || 'Contact',
            notes: `Interested in ${record['Service of Interest'] || 'services'}`,
            outcome: ''
          }]
        };
      });

      setProgress(30);
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85;
          }
          return prev + 5;
        });
      }, 1000);

      clearInterval(progressInterval);
      setProgress(70);

      const logsFromCustomers = processedData.flatMap(customer =>
        customer.interactions.map((i: any) => ({ ...i, customerId: customer.id }))
      );
      await saveCustomers(processedData as any);
      await saveLogs(logsFromCustomers as any);

      setProgress(100);
      toast.success('Successfully processed ' + processedData.length + ' customer records!');
      setFiles([]);
      setManualDeals([{ ...emptyDeal }]);
      
      setTimeout(() => {
        router.push('/analytics');
      }, 500);
    } catch (error: unknown) {
      console.error('Error processing content:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error('Error processing content: ' + errorMessage);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const processWithMapping = async () => {
    setUploading(true);
    setProgress(0);

    try {
      const mappedRecords = applyMapping(parsedHeaders, parsedRows, columnMapping);
      setProgress(30);

      const resolveStage = (rawStage: string): string => {
        const suggested = getDealStageLabel(rawStage);
        return suggested || rawStage;
      };

      const results = mappedRecords.map(record => {
        const parsedAmount = parseFloat((record.amount || '0').replace(/[^0-9.-]/g, '')) || 0;

        const id = record.record_id || 'deal_' + Math.random().toString(36).substr(2, 9);
        const name = record.deal_name || record.company || record.contact || '';
        const company = record.company || record.deal_name || record.contact || '';
        const contact = record.contact || '';
        const email = record.email || '';
        const stage = resolveStage(record.deal_stage || '') || record.deal_stage || '';
        const owner = record.deal_owner || '';
        const notes = record.notes || '';
        const closeDate = record.close_date || '';
        const lastActivity = record.last_activity || '';

        const deal = {
          id,
          name,
          stage,
          owner,
          contact,
          amount: parsedAmount,
          contactId: '',
          notes,
          closeDate,
          lastActivity,
          email,
          company,
        };

        const customer = {
          id,
          name: contact || name,
          email,
          company,
          lastContact: closeDate || lastActivity,
          status: mapDealStageToStatus(stage),
          value: parsedAmount,
          customerIntent: record.service_of_interest || 'Services',
          nextAction: owner
            ? `Follow up with ${owner} regarding ${stage}`
            : `Follow up regarding ${stage}`,
          notes: notes ? [notes] : [],
          interactions: [{
            timestamp: closeDate || lastActivity || new Date().toISOString().split('T')[0],
            type: stage || 'Contact',
            notes,
            outcome: ''
          }]
        };

        return { deal, customer };
      }).filter(({ deal }) => deal.name || deal.company || deal.contact);

      const dealsOnly = results.map(r => r.deal);
      const customersOnly = results.map(r => r.customer);
      const logsOnly = customersOnly.flatMap(customer =>
        customer.interactions.map(i => ({ ...i, customerId: customer.id }))
      );

      setProgress(70);
      await saveDeals(dealsOnly);
      await saveCustomers(customersOnly as any);
      await saveLogs(logsOnly as any);

      setProgress(100);
      toast.success(`Successfully processed ${results.length} records!`);
      setMappingStep(false);
      setUploadStep('columns');
      setFiles([]);
      setManualDeals([{ ...emptyDeal }]);

      setTimeout(() => {
        router.push('/analytics');
        router.refresh();
      }, 1000);
    } catch (error: unknown) {
      console.error('Error processing mapped data:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error('Error processing data: ' + errorMessage);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    try {
      const fileContents = await Promise.all(
        files.map(file => file.text())
      );
      const combinedContent = fileContents.join('\n');

      let parsed: { headers: string[]; rows: string[][] };
      try {
        parsed = parseFileContent(combinedContent);
      } catch {
        await processContent(combinedContent);
        return;
      }

      const { headers, rows } = parsed;

      const isDealsCSV = headers.includes('Record ID') && headers.includes('Deal Name');
      const isCustomerCSV = headers.includes('Point of Contact') && headers.includes('Service of Interest');

      if (isDealsCSV || isCustomerCSV) {
        await processContent(combinedContent);
        return;
      }

      setParsedHeaders(headers);
      setParsedRows(rows);

      const { mapping: autoMapping } = tryAutoMap(headers);
      let finalMapping = { ...autoMapping };

      setColumnMapping(autoMapping);
      setMappingStep(true);

      const unmappedHeaders = headers.filter(h => !autoMapping[h]);
      if (unmappedHeaders.length > 0) {
        setMappingLoading(true);
        try {
          const sampleRows = rows.slice(0, 3);
          const response = await fetch('/api/ai/map-columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers, sampleRows }),
          });

          if (response.ok) {
            const { mapping: aiMapping } = await response.json();
            const usedFields = new Set(
              Object.values(autoMapping).filter(Boolean)
            );

            for (const header of headers) {
              if (!finalMapping[header] && aiMapping[header] && !usedFields.has(aiMapping[header])) {
                finalMapping[header] = aiMapping[header];
                usedFields.add(aiMapping[header]);
              }
            }

            setColumnMapping(finalMapping);
          }
        } catch (err) {
          console.error('AI mapping unavailable, using auto-map:', err);
        } finally {
          setMappingLoading(false);
        }
      }
    } catch (error: unknown) {
      console.error('Error reading files:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error('Error reading files: ' + errorMessage);
    }
  };

  const addDeal = () => {
    setManualDeals([...manualDeals, { ...emptyDeal }]);
  };

  const removeDeal = (index: number) => {
    if (manualDeals.length > 1) {
      setManualDeals(manualDeals.filter((_, i) => i !== index));
    }
  };

  const updateDeal = (index: number, field: keyof DealFormData, value: string) => {
    const updated = [...manualDeals];
    updated[index] = { ...updated[index], [field]: value };
    setManualDeals(updated);
  };

  const handleManualUpload = async () => {
    const validDeals = manualDeals.filter(deal =>
      deal.recordId.trim() || deal.dealName.trim() || deal.company.trim() || deal.contact.trim()
    );

    if (validDeals.length === 0) {
      toast.error("Enter at least one deal (any of Record ID, Deal Name, Company, or Contact)");
      return;
    }

    const headers = ['Record ID', 'Deal Name', 'Company', 'Contact', 'Email', 'Deal Stage', 'Deal owner', 'Amount', 'Last Activity', 'Associated Note', 'Close Date'];
    const csvRows = [
      headers.join(','),
      ...validDeals.map(deal => [
        deal.recordId || '',
        deal.dealName || '',
        deal.company || '',
        deal.contact || '',
        deal.email || '',
        deal.dealStage || '',
        deal.dealOwner || '',
        deal.amount || '0',
        deal.lastActivity || '',
        deal.associatedNote || '',
        deal.closeDate || ''
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ];

    const csvContent = csvRows.join('\n');
    await processContent(csvContent, true);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const mappedCount = Object.values(columnMapping).filter(Boolean).length;

  return (
<div className="container mx-auto p-6 min-h-[85vh]">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
          Import
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">Upload CRM Data</h1>
        <p className="text-muted-foreground mt-1">Import deals and contacts from CSV or JSON</p>
        <button
          type="button"
          onClick={() => {
            const csv = `Company,Contact,Last Activity,Deal Stage,Amount,Notes
NovaTech Solutions,Sarah Johnson,2026-02-28,Proposal Sent,85000,Waiting on legal review
BlueWave Logistics,Michael Chen,2026-03-01,Discovery,42500,Initial requirements call completed
GreenField Retail,Amanda Rodriguez,2026-02-25,Negotiation,63200,Pricing adjusted awaiting signature`;
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample-deals.csv';
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          Download sample CSV
        </button>
      </div>

      <Card className="p-8 max-w-3xl mx-auto card-tech">
        <div className="flex flex-col h-full">
          {mappingStep ? (
            <>
              {uploadStep === 'columns' ? (
                <>
                  <h2 className="text-xl font-semibold text-center mb-2">Map Your Columns</h2>
                  <p className="text-sm text-gray-500 text-center mb-6">
                    We found <strong>{parsedHeaders.length}</strong> columns and <strong>{parsedRows.length}</strong> data rows.
                    Verify how each column maps to our CRM fields.
                  </p>

                  {mappingLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                      <p className="text-sm text-gray-500">AI is analyzing your columns...</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {parsedHeaders.map((header, i) => (
                          <div key={header} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" title={header}>{header}</p>
                              <p className="text-xs text-gray-400 truncate" title={parsedRows[0]?.[i] || ''}>
                                {parsedRows[0]?.[i] || '\u2014'}
                              </p>
                            </div>
                            <span className="text-gray-300 shrink-0">&rarr;</span>
                            <select
                              value={columnMapping[header] || ''}
                              onChange={(e) => {
                                setColumnMapping(prev => ({
                                  ...prev,
                                  [header]: (e.target.value || null) as ColumnMapping[string]
                                }));
                              }}
                              className={`flex-1 min-w-0 text-sm rounded-md border px-2 py-2 bg-background ${
                                columnMapping[header]
                                  ? 'border-green-400 text-green-700 dark:text-green-400'
                                  : 'border-red-400 dark:border-red-500'
                              }`}
                            >
                              <option value="">Skip this column</option>
                              {TARGET_FIELDS.map(field => {
                                const isUsedByOther = Object.entries(columnMapping)
                                  .some(([h, v]) => v === field.key && h !== header);
                                return (
                                  <option key={field.key} value={field.key} disabled={isUsedByOther}>
                                    {field.label}{isUsedByOther ? ' (already mapped)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between mt-6 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setMappingStep(false);
                            setUploadStep('columns');
                            setColumnMapping({});
                            setParsedHeaders([]);
                            setParsedRows([]);
                          }}
                        >
                          Back
                        </Button>
                        <span className="text-sm text-gray-500">
                          {mappedCount} of {parsedHeaders.length} mapped
                        </span>
                        <Button
                          onClick={processWithMapping}
                          disabled={uploading || mappedCount === 0}
                        >
                          {uploading ? 'Processing...' : 'Confirm & Process'}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : (
          <>
          <h2 className="text-xl font-semibold text-center mb-6">Import Your Data</h2>
          <Tabs defaultValue="file" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mb-4 h-auto min-h-[40px]">
              <TabsTrigger value="file" className="w-full text-sm sm:text-base">File Upload</TabsTrigger>
              <TabsTrigger value="manual" className="w-full text-sm sm:text-base">Type Manually</TabsTrigger>
            </TabsList>
            
            <TabsContent value="file" className="flex-1 flex flex-col mt-0">
              <div
                {...getRootProps()}
                className={`flex-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[300px]
                  ${isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-primary'}`}
              >
                <input {...getInputProps()} />
                <div className="text-5xl mb-4">📁</div>
                <p className="text-lg font-medium mb-2">
                  {isDragActive ? 'Drop your files here' : 'Drag and drop your CRM files here'}
                </p>
                <p className="text-sm text-gray-500 mb-4">or click to select files</p>
                {files.length > 0 && (
                  <div className="mt-6 text-sm space-y-2 w-full max-w-sm">
                    {files.map((file) => (
                      <p key={file.name} className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg truncate">{file.name}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setFiles([])}
                  disabled={files.length === 0}
                  className="px-6 py-2"
                >
                  Clear All
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={files.length === 0 || uploading}
                  className="px-6 py-2"
                >
                  {uploading ? 'Analyzing...' : 'Analyze Files'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="flex-1 flex flex-col mt-0">
              <p className="text-sm text-gray-500 italic mb-3">Leave blank if N/A — only Deal Name is required.</p>
              <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
                <div className="space-y-4">
                  {manualDeals.map((deal, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold">Deal #{index + 1}</h3>
                        {manualDeals.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeDeal(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`recordId-${index}`}>Record ID</Label>
                          <Input
                            id={`recordId-${index}`}
                            placeholder="123"
                            value={deal.recordId}
                            onChange={(e) => updateDeal(index, 'recordId', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`dealName-${index}`}>Deal Name</Label>
                          <Input
                            id={`dealName-${index}`}
                            placeholder="Acme Corp Deal"
                            value={deal.dealName}
                            onChange={(e) => updateDeal(index, 'dealName', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`company-${index}`}>Company</Label>
                          <Input
                            id={`company-${index}`}
                            placeholder="Acme Corp"
                            value={deal.company}
                            onChange={(e) => updateDeal(index, 'company', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`contact-${index}`}>Contact</Label>
                          <Input
                            id={`contact-${index}`}
                            placeholder="Jane Smith"
                            value={deal.contact}
                            onChange={(e) => updateDeal(index, 'contact', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`email-${index}`}>Email</Label>
                          <Input
                            id={`email-${index}`}
                            type="email"
                            placeholder="jane@acme.com"
                            value={deal.email}
                            onChange={(e) => updateDeal(index, 'email', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`dealStage-${index}`}>Deal Stage</Label>
                          <select
                            id={`dealStage-${index}`}
                            value={deal.dealStage}
                            onChange={(e) => updateDeal(index, 'dealStage', e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Select stage...</option>
                            <DealStageOptions />
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`dealOwner-${index}`}>Deal Owner</Label>
                          <Input
                            id={`dealOwner-${index}`}
                            placeholder="John Doe"
                            value={deal.dealOwner}
                            onChange={(e) => updateDeal(index, 'dealOwner', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`amount-${index}`}>Amount ($)</Label>
                          <Input
                            id={`amount-${index}`}
                            type="number"
                            placeholder="15000"
                            value={deal.amount}
                            onChange={(e) => updateDeal(index, 'amount', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`lastActivity-${index}`}>Last Activity</Label>
                          <Input
                            id={`lastActivity-${index}`}
                            type="date"
                            value={deal.lastActivity}
                            onChange={(e) => updateDeal(index, 'lastActivity', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`closeDate-${index}`}>Close Date</Label>
                          <Input
                            id={`closeDate-${index}`}
                            type="date"
                            value={deal.closeDate}
                            onChange={(e) => updateDeal(index, 'closeDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`associatedNote-${index}`}>Notes</Label>
                          <Input
                            id={`associatedNote-${index}`}
                            placeholder="Follow up next week"
                            value={deal.associatedNote}
                            onChange={(e) => updateDeal(index, 'associatedNote', e.target.value)}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={addDeal}
                  className="w-full"
                >
                  + Add Another Deal
                </Button>
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setManualDeals([{ ...emptyDeal }])}
                    disabled={manualDeals.length === 1 && !manualDeals[0].recordId.trim() && !manualDeals[0].dealName.trim() && !manualDeals[0].company.trim() && !manualDeals[0].contact.trim()}
                    className="px-6 py-2"
                  >
                    Clear All
                  </Button>
                  <Button
                    onClick={handleManualUpload}
                    disabled={uploading || manualDeals.every(deal => !deal.recordId.trim() && !deal.dealName.trim() && !deal.company.trim() && !deal.contact.trim())}
                    className="px-6 py-2"
                  >
                    {uploading ? 'Analyzing...' : 'Analyze Deals'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          </>
          )}
          
          {uploading && (
            <div className="mt-4 space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-gray-500">Processing your data... {progress}%</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
