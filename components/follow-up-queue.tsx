"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Clock, Mail, RefreshCw } from "lucide-react"
import { generateFollowUpEmail } from "@/lib/generate-email"

type FollowUp = {
  id: string
  customer: string
  company: string
  reason: string
  suggestedDate: string
  priority: "low" | "medium" | "high"
  status: "pending" | "scheduled" | "sent"
  emailDraft?: string
}

export function FollowUpQueue() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([
    {
      id: "1",
      customer: "John Smith",
      company: "Acme Corp",
      reason: "No response after product demo",
      suggestedDate: "2023-11-22",
      priority: "high",
      status: "pending",
    },
    {
      id: "2",
      customer: "Sarah Johnson",
      company: "TechStart Inc",
      reason: "Requested pricing follow-up",
      suggestedDate: "2023-11-20",
      priority: "medium",
      status: "scheduled",
    },
    {
      id: "3",
      customer: "Michael Brown",
      company: "Innovate LLC",
      reason: "Contract renewal discussion",
      suggestedDate: "2023-11-25",
      priority: "high",
      status: "pending",
    },
    {
      id: "4",
      customer: "Emily Davis",
      company: "First Choice Partners",
      reason: "Feature request clarification",
      suggestedDate: "2023-11-21",
      priority: "low",
      status: "sent",
    },
  ])

  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [emailContent, setEmailContent] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleGenerateEmail = async (followUp: FollowUp) => {
    setSelectedFollowUp(followUp)
    setIsGenerating(true)
    setIsDialogOpen(true)

    try {
      // In a real app, this would call an API to generate the email
      const generatedEmail = await generateFollowUpEmail(followUp, ["Some sample notes"])
      setEmailContent(generatedEmail)
    } catch (error) {
      console.error("Error generating email:", error)
      setEmailContent("Failed to generate email. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSendEmail = () => {
    if (selectedFollowUp) {
      // In a real app, this would send the email
      setFollowUps(followUps.map((item) => (item.id === selectedFollowUp.id ? { ...item, status: "sent" } : item)))
      setIsDialogOpen(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-green-100 text-green-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "high":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500 text-white"
      case "scheduled":
        return "bg-blue-500 text-white"
      case "sent":
        return "bg-green-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Follow-up Queue</CardTitle>
          <CardDescription>AI-suggested follow-ups based on CRM log analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Suggested Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followUps.map((followUp) => (
                  <TableRow key={followUp.id}>
                    <TableCell>
                      <Checkbox />
                    </TableCell>
                    <TableCell className="font-medium">{followUp.customer}</TableCell>
                    <TableCell>{followUp.company}</TableCell>
                    <TableCell>{followUp.reason}</TableCell>
                    <TableCell>{followUp.suggestedDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(followUp.priority)}>
                        {followUp.priority.charAt(0).toUpperCase() + followUp.priority.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(followUp.status)}>
                        {followUp.status.charAt(0).toUpperCase() + followUp.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateEmail(followUp)}
                        disabled={followUp.status === "sent"}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        {followUp.status === "sent" ? "Sent" : "Generate Email"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="mr-1 h-4 w-4" />
            <span>4 follow-ups pending</span>
          </div>
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Queue
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {isGenerating ? "Generating follow-up email..." : `Follow-up Email for ${selectedFollowUp?.customer}`}
            </DialogTitle>
            <DialogDescription>
              {isGenerating
                ? "Our AI is crafting a personalized follow-up email based on previous interactions."
                : "Review and edit the AI-generated email before sending."}
            </DialogDescription>
          </DialogHeader>

          {isGenerating ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Textarea
                    value={
                      emailContent ||
                      `Dear ${selectedFollowUp?.customer},

I hope this email finds you well. I wanted to follow up on our recent discussion about our product offering.

Based on our conversation, I thought you might be interested in scheduling a follow-up call to address any questions you might have.

Would you be available for a brief call next week?

Best regards,
Your Account Manager`
                    }
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="min-h-[200px]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSendEmail}>Send Email</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

