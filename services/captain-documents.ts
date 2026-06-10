// services/captain-documents.ts
import { api } from '@/lib/api'

export const DOC_TYPES = [
  'driver_license',
  'car_registration',
  'captain_selfie',
  'national_id_front',
  'national_id_back',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export interface Completeness {
  complete: boolean
  uploaded: DocType[]
  missing: DocType[]
}

/**
 * Upload one document via the presigned-PUT flow:
 *   1. POST .../documents/upload-url { doc_type } → { upload_url, object_key }
 *   2. PUT the raw image bytes to upload_url (NO auth header — presigned)
 *   3. POST .../documents { doc_type, object_key } (bearer) → confirm/upsert
 * Throws if any step fails so the UI can show "failed · retry".
 */
export async function uploadDocument(
  captainId: string,
  docType: DocType,
  localUri: string,
): Promise<void> {
  const { data: slot } = await api.post<{
    upload_url: string
    object_key: string
    expires_in: number
  }>(`/api/captains/${captainId}/documents/upload-url`, { doc_type: docType })

  const file = await fetch(localUri)
  const blob = await file.blob()
  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!put.ok) throw new Error(`document upload failed: ${put.status}`)

  await api.post(`/api/captains/${captainId}/documents`, {
    doc_type: docType,
    object_key: slot.object_key,
  })
}

/** Which of the 5 required docs are present. */
export async function getCompleteness(captainId: string): Promise<Completeness> {
  const { data } = await api.get<Completeness>(
    `/api/captains/${captainId}/documents/completeness`,
  )
  return data
}
