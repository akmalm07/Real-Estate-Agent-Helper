import { db } from '../db/index.js';
import {
  leads,
  properties,
  leadNotes,
  leadTasks,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';

/* Loads the property description and address for a given lead.
 *
 * Parameters:
 *   leadId: number — the lead's database ID
 *
 * Returns:
 *   string | null — formatted property info, or null if no property is linked
 */
export async function loadPropertyDescription(leadId) {
  const [result] = await db
    .select({
      propertyDescription: properties.description,
      propertyAddress1: properties.addressLine1,
      propertyAddress2: properties.addressLine2,
    })
    .from(leads)
    .leftJoin(properties, eq(leads.propertyId, properties.id))
    .where(eq(leads.id, leadId));

  if (!result || !result.propertyAddress1) return null;

  const addressSection = result.propertyAddress2
    ? `Address: ${result.propertyAddress1}, ${result.propertyAddress2}`
    : `Address: ${result.propertyAddress1}`;

  return `${addressSection}\n${result.propertyDescription}`;
}

/* Loads all notes for a given lead from the database.
 *
 * Parameters:
 *   leadId: number — the lead's database ID
 *
 * Returns:
 *   Array of note strings
 */
export async function loadLeadNotes(leadId) {
  const notes = await db
    .select()
    .from(leadNotes)
    .where(eq(leadNotes.leadId, leadId));

  return notes.map((n) => n.note);
}

/* Persists a lead note to the database.
 *
 * Parameters:
 *   leadId: number — the lead's database ID
 *   note:   string — the note text to save
 */
export async function saveLeadNote(leadId, note) {
  await db.insert(leadNotes).values({ leadId, note });
}

/* Persists a lead task to the database.
 *
 * Parameters:
 *   leadId:  number        — the lead's database ID
 *   title:   string        — the task title
 *   dueDate: string | null — ISO 8601 date string or null
 */
export async function saveLeadTask(leadId, title, dueDate) {
  await db.insert(leadTasks).values({
    leadId,
    title,
    dueDate: dueDate ? new Date(dueDate) : null,
  });
}
