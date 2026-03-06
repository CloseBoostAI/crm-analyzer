"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogAnalyzer } from "@/components/log-analyzer"
import { FollowUpQueue } from "@/components/follow-up-queue"
import { EmailTemplates } from "@/components/email-templates"
import { Analytics } from "@/components/analytics"
import { DashboardHeader } from "@/components/dashboard-header"
import { CustomerNotes } from "@/components/customer-notes"

export function CrmDashboard() {
  const [activeTab, setActiveTab] = useState("logs")

  return (
    <div className="container mx-auto py-6 space-y-6">
      <DashboardHeader />

      <Tabs defaultValue="logs" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-4xl mx-auto">
          <TabsTrigger value="logs">CRM Logs</TabsTrigger>
          <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="notes">Customer Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <LogAnalyzer />
        </TabsContent>

        <TabsContent value="follow-ups" className="space-y-4">
          <FollowUpQueue />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <EmailTemplates />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Analytics />
        </TabsContent>
        <TabsContent value="notes" className="space-y-4">
          <CustomerNotes />
        </TabsContent>
      </Tabs>
    </div>
  )
}

