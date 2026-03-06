"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Save, Trash } from "lucide-react"

type Template = {
  id: string
  name: string
  subject: string
  content: string
  category: string
}

export function EmailTemplates() {
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: "1",
      name: "Post-Demo Follow-up",
      subject: "Following up on our product demo",
      content:
        "Dear {{customer_name}},\n\nThank you for taking the time to join our product demonstration on {{demo_date}}. I hope you found it informative and valuable.\n\nI wanted to follow up to see if you had any questions about what we covered or if you'd like to schedule a more in-depth discussion about how our solution can address your specific needs.\n\nBest regards,\n{{account_manager}}",
      category: "sales",
    },
    {
      id: "2",
      name: "Pricing Inquiry Response",
      subject: "Pricing information for {{company_name}}",
      content:
        "Dear {{customer_name}},\n\nThank you for your interest in our pricing options. Based on your requirements, I've attached a customized pricing proposal for your review.\n\nI'd be happy to schedule a call to walk through the details and answer any questions you might have.\n\nBest regards,\n{{account_manager}}",
      category: "sales",
    },
    {
      id: "3",
      name: "Support Follow-up",
      subject: "Following up on your recent support request",
      content:
        "Dear {{customer_name}},\n\nI wanted to follow up on the support request you submitted on {{ticket_date}} regarding {{issue_description}}.\n\nHas the solution provided resolved your issue completely? If you're still experiencing any problems, please let me know so we can address them promptly.\n\nBest regards,\n{{support_agent}}",
      category: "support",
    },
  ])

  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null)
  const [activeCategory, setActiveCategory] = useState("all")

  const handleEditTemplate = (template: Template) => {
    setActiveTemplate({ ...template })
  }

  const handleSaveTemplate = () => {
    if (activeTemplate) {
      if (templates.some((t) => t.id === activeTemplate.id)) {
        // Update existing template
        setTemplates(templates.map((t) => (t.id === activeTemplate.id ? activeTemplate : t)))
      } else {
        // Add new template
        setTemplates([
          ...templates,
          {
            ...activeTemplate,
            id: Date.now().toString(),
          },
        ])
      }
      setActiveTemplate(null)
    }
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id))
    if (activeTemplate?.id === id) {
      setActiveTemplate(null)
    }
  }

  const filteredTemplates =
    activeCategory === "all" ? templates : templates.filter((t) => t.category === activeCategory)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>Manage your AI-powered email templates for different scenarios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="sales">Sales</TabsTrigger>
                    <TabsTrigger value="support">Support</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setActiveTemplate({
                      id: "",
                      name: "",
                      subject: "",
                      content: "",
                      category: "sales",
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>

              <div className="border rounded-md divide-y max-h-[500px] overflow-y-auto">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 cursor-pointer hover:bg-muted ${activeTemplate?.id === template.id ? "bg-muted" : ""}`}
                    onClick={() => handleEditTemplate(template)}
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{template.subject}</div>
                  </div>
                ))}
                {filteredTemplates.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">No templates found</div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              {activeTemplate ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <label htmlFor="template-name" className="text-sm font-medium">
                      Template Name
                    </label>
                    <Input
                      id="template-name"
                      value={activeTemplate.name}
                      onChange={(e) => setActiveTemplate({ ...activeTemplate, name: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="template-category" className="text-sm font-medium">
                      Category
                    </label>
                    <select
                      id="template-category"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={activeTemplate.category}
                      onChange={(e) => setActiveTemplate({ ...activeTemplate, category: e.target.value })}
                    >
                      <option value="sales">Sales</option>
                      <option value="support">Support</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="template-subject" className="text-sm font-medium">
                      Email Subject
                    </label>
                    <Input
                      id="template-subject"
                      value={activeTemplate.subject}
                      onChange={(e) => setActiveTemplate({ ...activeTemplate, subject: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <label htmlFor="template-content" className="text-sm font-medium">
                      Email Content
                    </label>
                    <Textarea
                      id="template-content"
                      value={activeTemplate.content}
                      onChange={(e) => setActiveTemplate({ ...activeTemplate, content: e.target.value })}
                      className="min-h-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use {{ variable_name }} for dynamic content that will be replaced when sending.
                    </p>
                  </div>

                  <div className="flex justify-end space-x-2">
                    {activeTemplate.id && (
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteTemplate(activeTemplate.id)}>
                        <Trash className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setActiveTemplate(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveTemplate}>
                      <Save className="h-4 w-4 mr-1" />
                      Save Template
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full border rounded-md p-8">
                  <div className="text-center">
                    <h3 className="text-lg font-medium">Select a template</h3>
                    <p className="text-sm text-muted-foreground mt-1">Choose a template to edit or create a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

