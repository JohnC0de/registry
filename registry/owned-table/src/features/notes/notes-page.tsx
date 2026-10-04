import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Route } from "@/routes/_authed/notes"
import { $createNote, $deleteNote } from "@/lib/notes/server"

/**
 * Loader data + `router.invalidate()` is the default data flow here - no client cache to keep in
 * sync. `useServerFn` is what makes a redirect thrown by the auth gate actually navigate.
 */
export function NotesPage() {
  const notes = Route.useLoaderData()
  const router = useRouter()
  const createNote = useServerFn($createNote)
  const deleteNote = useServerFn($deleteNote)
  const [title, setTitle] = useState("")

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return
    await createNote({ data: { title } })
    setTitle("")
    await router.invalidate()
  }

  async function remove(id: string) {
    await deleteNote({ data: { id } })
    await router.invalidate()
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Notes</h1>

      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <Input
          aria-label="Note title"
          placeholder="New note…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm">{note.title}</span>
              <Button variant="destructive" size="sm" onClick={() => void remove(note.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
