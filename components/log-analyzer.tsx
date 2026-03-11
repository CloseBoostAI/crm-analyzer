"use client"

import { CardDescription } from "@/components/ui/card"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar, Filter, Search, Upload } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { analyzeCustomerLogs } from "@/lib/analyze-logs"

type LogEntry = {
  id: string
  customer: string
  interaction: string
  date: string
  status: "new" | "contacted" | "follow-up" | "closed"
  lastContact: string
}

export function LogAnalyzer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "1",
      customer: "Acme Corp",
      interaction: "Product demo call",
      date: "2023-11-15",
      status: "follow-up",
      lastContact: "7 days ago",
    },
    {
      id: "2",
      customer: "TechStart Inc",
      interaction: "Pricing inquiry",
      date: "2023-11-10",
      status: "contacted",
      lastContact: "3 days ago",
    },
    {
      id: "3",
      customer: "Global Services",
      interaction: "Support ticket",
      date: "2023-11-18",
      status: "new",
      lastContact: "1 day ago",
    },
    {
      id: "4",
      customer: "Innovate LLC",
      interaction: "Contract renewal discussion",
      date: "2023-11-05",
      status: "follow-up",
      lastContact: "14 days ago",
    },
    {
      id: "5",
      customer: "First Choice Partners",
      interaction: "Feature request",
      date: "2023-11-12",
      status: "contacted",
      lastContact: "5 days ago",
    },
  ])

  const [analyzing, setAnalyzing] = useState(false)
  const [notes, setNotes] = useState<{ [key: string]: string[] }>({})

  useEffect(() => {
    // In a real app, this would fetch notes from your API
    const mockNotes = {
      "1": ["Interested in new features", "Requested follow-up next quarter"],
      "2": ["Price sensitive", "Comparing with competitors"],
      "3": ["Experienced technical issues", "Needs extra support"],
      "4": ["Long-time customer", "Considering contract renewal"],
      "5": ["New customer", "Onboarding in progress"],
    }
    setNotes(mockNotes)
  }, [])

  const handleAnalyzeLogs = async () => {
    setAnalyzing(true)
    try {
      // In a real app, this would call an API to analyze the logs
      const result = await analyzeCustomerLogs(logs, notes)
      setTimeout(() => {
        setAnalyzing(false)
      }, 1500)
    } catch (error) {
      console.error("Error analyzing logs:", error)
      setAnalyzing(false)
    }
  }

  const filteredLogs = logs.filter(
    (log) =>
      log.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.interaction.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500"
      case "contacted":
        return "bg-yellow-500"
      case "follow-up":
        return "bg-red-500"
      case "closed":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>CRM Log Analysis</CardTitle>
          <CardDescription>Analyze customer interaction logs to identify follow-up opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search logs..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="follow-up">Needs Follow-up</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Upload className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Interaction</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.customer}</TableCell>
                    <TableCell>{log.interaction}</TableCell>
                    <TableCell>{log.date}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`${getStatusColor(log.status)} text-white`}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.lastContact}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="mr-1 h-4 w-4" />
            <span>Last updated: Today at 10:30 AM</span>
          </div>
          <Button onClick={handleAnalyzeLogs} disabled={analyzing}>
            {analyzing ? "Analyzing..." : "Analyze Logs"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

