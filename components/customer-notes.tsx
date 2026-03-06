"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Trash } from "lucide-react"

type Note = {
  id: string
  customerId: string
  content: string
  timestamp: string
}

type Customer = {
  id: string
  name: string
  company: string
}

export function CustomerNotes() {
  const [customers, setCustomers] = useState<Customer[]>([
    { id: "1", name: "John Smith", company: "Acme Corp" },
    { id: "2", name: "Sarah Johnson", company: "TechStart Inc" },
    { id: "3", name: "Michael Brown", company: "Innovate LLC" },
    { id: "4", name: "Emily Davis", company: "First Choice Partners" },
  ])

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [newNote, setNewNote] = useState("")

  useEffect(() => {
    if (selectedCustomer) {
      // In a real app, fetch notes for the selected customer from an API
      const mockNotes: Note[] = [
        {
          id: "1",
          customerId: selectedCustomer,
          content: "Discussed new product features",
          timestamp: "2023-11-15 10:30 AM",
        },
        {
          id: "2",
          customerId: selectedCustomer,
          content: "Scheduled follow-up call for next week",
          timestamp: "2023-11-16 2:15 PM",
        },
      ]
      setNotes(mockNotes)
    } else {
      setNotes([])
    }
  }, [selectedCustomer])

  const handleAddNote = () => {
    if (selectedCustomer && newNote.trim()) {
      const newNoteObj: Note = {
        id: Date.now().toString(),
        customerId: selectedCustomer,
        content: newNote.trim(),
        timestamp: new Date().toLocaleString(),
      }
      setNotes([newNoteObj, ...notes])
      setNewNote("")
      // In a real app, you would also save this note to your backend
    }
  }

  const handleDeleteNote = (noteId: string) => {
    setNotes(notes.filter((note) => note.id !== noteId))
    // In a real app, you would also delete this note from your backend
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Customer Notes</CardTitle>
        <CardDescription>Manage and view customer interaction notes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-4 mb-4">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedCustomer || ""}
            onChange={(e) => setSelectedCustomer(e.target.value)}
          >
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.company}
              </option>
            ))}
          </select>
        </div>
        {selectedCustomer && (
          <>
            <div className="flex space-x-2 mb-4">
              <Textarea
                placeholder="Add a new note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="flex-grow"
              />
              <Button onClick={handleAddNote}>
                <Plus className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            </div>
            <ScrollArea className="h-[300px] w-full rounded-md border p-4">
              {notes.map((note) => (
                <div key={note.id} className="mb-4 p-2 border rounded-md">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm text-muted-foreground">{note.timestamp}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteNote(note.id)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                  <p>{note.content}</p>
                </div>
              ))}
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}

