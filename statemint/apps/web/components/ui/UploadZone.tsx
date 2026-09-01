'use client'
import { useState, useRef } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { Document } from '@/types'

interface UploadZoneProps {
  onUploadComplete: (doc: Document) => void
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted')
      return
    }
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('statement', file)
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUploadComplete(res.data.data)
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
      onClick={() => !uploading && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#00D97E' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 14,
        padding: '36px 24px',
        textAlign: 'center',
        cursor: uploading ? 'default' : 'pointer',
        background: dragging ? 'rgba(0,217,126,0.05)' : 'rgba(255,255,255,0.02)',
        transition: 'all 0.2s',
      }}
    >
      <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />

      {uploading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Loader2 size={28} style={{ color: '#00D97E' }} className="animate-spin" />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: 14 }}>Uploading and processing...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 52, height: 52,
            background: 'rgba(0,217,126,0.10)',
            border: '1px solid rgba(0,217,126,0.20)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Upload size={22} style={{ color: '#00D97E' }} />
          </div>
          <div>
            <p style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Drop your bank statement here</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>or click to browse — PDF files only</p>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: '#FF4D4D', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </div>
  )
}