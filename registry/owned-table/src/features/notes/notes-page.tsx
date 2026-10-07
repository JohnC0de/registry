import { getRouteApi, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Note } from "@/lib/notes/schemas"
import { $createNote, $deleteNote, $updateNote } from "@/lib/notes/server"

const route = getRouteApi("/_authed/notes")

/** One note: shows the title, or a rename form (Enter saves, Escape cancels, labelled for screen readers). */
function NoteRow({ note }: { note: Note }) {
  const router = useRouter()
  const updateNote = useServerFn($updateNote)
  const deleteNote = useServerFn($deleteNote)
  const [draft, setDraft] = useState<string | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // Closing the form removes the focused input: put focus back on this note's Rename button.
  useEffect(() => {
    if (draft === null && returnFocus.current) {
      returnFocus.current = false
      renameButton.current?.focus()
    }
  }, [draft])

  function closeEditor() {
    returnFocus.current = true
    setDraft(null)
  }

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft?.trim()) await updateNote({ data: { id: note.id, title: draft, body: note.body } })
    closeEditor()
    await router.invalidate()
  }

  async function remove() {
    await deleteNote({ data: { id: note.id } })
    await router.invalidate()
  }

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
      {draft === null ? (
        <>
          <span className="text-sm">{note.title}</span>
          <div className="flex gap-2">
            <Button
              ref={renameButton}
              variant="outline"
              size="sm"
              onClick={() => setDraft(note.title)}
            >
              Rename
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        </>
      ) : (
        <form className="flex w-full gap-2" onSubmit={(e) => void save(e)}>
          <Input
            ref={(el) => el?.focus()}
            aria-label={`Rename note ${note.title}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeEditor()
            }}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      )}
    </li>
  )
}

/**
 * Loader data + `router.invalidate()` is the default data flow here - no client cache to keep in
 * sync. `useServerFn` is what makes a redirect thrown by the auth gate actually navigate.
 */
export function NotesPage() {
  const notes = route.useLoaderData()
  const router = useRouter()
  const createNote = useServerFn($createNote)
  const [title, setTitle] = useState("")

  async function add(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return
    await createNote({ data: { title } })
    setTitle("")
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
            <NoteRow key={note.id} note={note} />
          ))}
        </ul>
      )}
    </section>
  )
}
