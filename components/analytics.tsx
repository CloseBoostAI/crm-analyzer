"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, LineChart, PieChart } from "@/components/charts"

export function Analytics() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total Follow-ups</CardTitle>
            <CardDescription>Monthly follow-up emails sent</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">247</div>
            <p className="text-xs text-muted-foreground">+12.5% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Response Rate</CardTitle>
            <CardDescription>Percentage of emails with responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">68.3%</div>
            <p className="text-xs text-muted-foreground">+5.2% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversion Rate</CardTitle>
            <CardDescription>Follow-ups resulting in next steps</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32.1%</div>
            <p className="text-xs text-muted-foreground">+3.7% from last month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="followups">
        <TabsList>
          <TabsTrigger value="followups">Follow-up Performance</TabsTrigger>
          <TabsTrigger value="response">Response Times</TabsTrigger>
          <TabsTrigger value="templates">Template Effectiveness</TabsTrigger>
        </TabsList>
        <TabsContent value="followups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Follow-up Performance</CardTitle>
              <CardDescription>Monthly follow-up emails sent and response rates</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <BarChart />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="response" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Response Times</CardTitle>
              <CardDescription>Average time to customer response after follow-up</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <LineChart />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template Effectiveness</CardTitle>
              <CardDescription>Response rates by email template</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <PieChart />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

