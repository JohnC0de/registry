import { createFileRoute } from "@tanstack/react-router"

import { NotesPage } from "@/features/notes/notes-page"
import { $listNotes } from "@/lib/notes/server"

/** Example protected page - delete it with the rest of the notes demo. */
export const Route = createFileRoute("/_authed/notes")({
  loader: () => $listNotes(),
  component: NotesPage,
})
