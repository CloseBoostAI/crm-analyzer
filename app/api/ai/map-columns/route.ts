import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const { headers, sampleRows } = await request.json();

    const targetFields: Record<string, string> = {
      record_id: 'A unique identifier for the record/deal (e.g., ID, Record ID, Deal #)',
      deal_name: 'The name of the deal, opportunity, or project',
      company: 'The company or organization name',
      contact: 'The contact person or point of contact name',
      email: 'Email address',
      deal_stage: 'The current stage/status of the deal (e.g., Proposal, Negotiation, Won, Lost)',
      deal_owner: 'The person responsible for or assigned to the deal',
      amount: 'The monetary value/amount of the deal',
      priority: 'Priority level (High, Medium, Low)',
      last_activity: 'Date of the most recent activity or interaction',
      notes: 'Any notes, comments, or descriptions',
      close_date: 'Expected or actual close/completion date',
      service_of_interest: 'The product, service, or category of interest',
    };

    const prompt = `You are a data mapping assistant. Given CSV headers and sample data from a CRM or sales file, map each source column to the most appropriate target field.

Target fields and their descriptions:
${Object.entries(targetFields).map(([key, desc]) => `- "${key}": ${desc}`).join('\n')}

Source headers: ${JSON.stringify(headers)}

Sample data (first ${sampleRows.length} rows):
${sampleRows.map((row: string[], i: number) => `Row ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

Return ONLY a valid JSON object where:
- Keys are the source column names (exactly as provided)
- Values are the target field names from the list above, or null if no good match exists

Example response format:
{"Customer Name": "contact", "Deal Value": "amount", "Status": "deal_stage", "Random Column": null}

IMPORTANT: Return ONLY the JSON object, no explanation or markdown.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a precise data mapping assistant. Always respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: 'AI service error', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    let mapping;
    try {
      const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      mapping = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: content },
        { status: 500 }
      );
    }

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error('Column mapping error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
