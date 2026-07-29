-- Add composite unique constraint on event_id + sort_order in ticket_types
CREATE UNIQUE INDEX "ticket_types_event_id_sort_order_key" ON "ticket_types"("event_id", "sort_order");

-- Change registrations FK from ON DELETE SET NULL to ON DELETE RESTRICT
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_type_id_fkey";
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
