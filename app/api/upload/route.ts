import { NextRequest, NextResponse } from 'next/server'

const LYZR_UPLOAD_URL = 'https://agent-prod.studio.lyzr.ai/v3/assets/upload'
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

export async function GET() {
  return NextResponse.json({ status: 'ok', upload: 'POST only' })
}

export async function POST(request: NextRequest) {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: 0,
          successful_uploads: 0,
          failed_uploads: 0,
          message: 'LYZR_API_KEY not configured',
          timestamp: new Date().toISOString(),
          error: 'LYZR_API_KEY not configured on server',
        },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files')

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: 0,
          successful_uploads: 0,
          failed_uploads: 0,
          message: 'No files provided',
          timestamp: new Date().toISOString(),
          error: 'No files provided',
        },
        { status: 400 }
      )
    }

    // Forward each file to Lyzr API, converting to Blob for Node.js compat
    const uploadFormData = new FormData()
    for (const file of files) {
      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: file.type || 'application/octet-stream' })
        uploadFormData.append('files', blob, file.name)
      }
    }

    const response = await fetch(LYZR_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'x-api-key': LYZR_API_KEY,
      },
      body: uploadFormData,
    })

    const responseText = await response.text()
    let data: any = {}
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('Non-JSON upload response:', responseText)
    }

    if (response.ok) {
      // Handle multiple possible response structures from Lyzr API
      let assetIds: string[] = []
      let uploadedFiles: any[] = []

      // Structure 1: { results: [{ asset_id, file_name, success }] }
      if (Array.isArray(data.results)) {
        uploadedFiles = data.results.map((r: any) => ({
          asset_id: r.asset_id || r.id || '',
          file_name: r.file_name || r.filename || '',
          success: r.success ?? true,
          error: r.error,
        }))
        assetIds = uploadedFiles
          .filter((f: any) => f.success && f.asset_id)
          .map((f: any) => f.asset_id)
      }
      // Structure 2: { files: [{ asset_id, ... }] }
      else if (Array.isArray(data.files)) {
        uploadedFiles = data.files.map((r: any) => ({
          asset_id: r.asset_id || r.id || '',
          file_name: r.file_name || r.filename || r.name || '',
          success: r.success ?? true,
          error: r.error,
        }))
        assetIds = uploadedFiles
          .filter((f: any) => f.success && f.asset_id)
          .map((f: any) => f.asset_id)
      }
      // Structure 3: { asset_id: "..." } (single file)
      else if (data.asset_id) {
        assetIds = [data.asset_id]
        uploadedFiles = [{
          asset_id: data.asset_id,
          file_name: data.file_name || data.filename || '',
          success: true,
        }]
      }
      // Structure 4: { id: "..." } (single file alt)
      else if (data.id) {
        assetIds = [data.id]
        uploadedFiles = [{
          asset_id: data.id,
          file_name: data.file_name || data.filename || '',
          success: true,
        }]
      }
      // Structure 5: { asset_ids: [...] }
      else if (Array.isArray(data.asset_ids)) {
        assetIds = data.asset_ids
        uploadedFiles = data.asset_ids.map((id: string) => ({
          asset_id: id,
          file_name: '',
          success: true,
        }))
      }
      // Structure 6: Array at top level [{ asset_id, ... }]
      else if (Array.isArray(data)) {
        uploadedFiles = data.map((r: any) => ({
          asset_id: r.asset_id || r.id || '',
          file_name: r.file_name || r.filename || '',
          success: r.success ?? true,
          error: r.error,
        }))
        assetIds = uploadedFiles
          .filter((f: any) => f.success && f.asset_id)
          .map((f: any) => f.asset_id)
      }

      // If we still have no asset_ids, log the full response for debugging
      if (assetIds.length === 0) {
        console.error('Upload succeeded but no asset_ids extracted. Full response:', JSON.stringify(data))
      }

      return NextResponse.json({
        success: assetIds.length > 0,
        asset_ids: assetIds,
        files: uploadedFiles,
        total_files: data.total_files || files.length,
        successful_uploads: data.successful_uploads || assetIds.length,
        failed_uploads: data.failed_uploads || (assetIds.length === 0 ? files.length : 0),
        message: assetIds.length > 0
          ? `Successfully uploaded ${assetIds.length} file(s)`
          : 'Upload completed but no asset IDs were returned',
        timestamp: new Date().toISOString(),
        raw_keys: Object.keys(data),
      })
    } else {
      console.error('Upload API error:', response.status, responseText)

      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: files.length,
          successful_uploads: 0,
          failed_uploads: files.length,
          message: `Upload failed with status ${response.status}`,
          timestamp: new Date().toISOString(),
          error: data?.detail || data?.message || data?.error || responseText,
        },
        { status: response.status }
      )
    }
  } catch (error) {
    console.error('File upload error:', error)

    return NextResponse.json(
      {
        success: false,
        asset_ids: [],
        files: [],
        total_files: 0,
        successful_uploads: 0,
        failed_uploads: 0,
        message: 'Server error during upload',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
