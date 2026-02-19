import { NextRequest, NextResponse } from 'next/server'

const LYZR_UPLOAD_URL = 'https://agent-prod.studio.lyzr.ai/v3/assets/upload'
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

export async function GET() {
  return NextResponse.json({ status: 'ok', upload: 'POST only' })
}

/**
 * Recursively search any object/array for asset-id-like values.
 * Looks for keys containing "asset", "id", "file_id", etc.
 */
function deepExtractAssetIds(obj: any, depth = 0): string[] {
  if (depth > 10) return []
  const ids: string[] = []

  if (!obj || typeof obj !== 'object') return ids

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'string' && item.length >= 10) {
        ids.push(item)
      } else if (typeof item === 'object') {
        ids.push(...deepExtractAssetIds(item, depth + 1))
      }
    }
    return ids
  }

  // Check known key patterns for asset IDs
  const idKeys = [
    'asset_id', 'assetId', 'asset_ids', 'assetIds',
    'id', '_id', 'file_id', 'fileId',
    'upload_id', 'uploadId', 'document_id', 'documentId',
  ]

  for (const key of idKeys) {
    if (key in obj) {
      const val = obj[key]
      if (typeof val === 'string' && val.length > 0) {
        ids.push(val)
      } else if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'string' && v.length > 0) ids.push(v)
        }
      }
    }
  }

  // If no IDs found at this level, recurse into nested objects/arrays
  if (ids.length === 0) {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val && typeof val === 'object') {
        ids.push(...deepExtractAssetIds(val, depth + 1))
      }
    }
  }

  return ids
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

    // Convert files and try both field names: "files" and "file"
    const fileEntries: { name: string; blob: Blob }[] = []
    for (const file of files) {
      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: file.type || 'application/octet-stream' })
        fileEntries.push({ name: file.name, blob })
      }
    }

    // Try upload with field name "file" first (common in Lyzr API)
    let response: Response | null = null
    let responseText = ''
    let data: any = {}

    for (const fieldName of ['file', 'files']) {
      const uploadFormData = new FormData()
      for (const entry of fileEntries) {
        uploadFormData.append(fieldName, entry.blob, entry.name)
      }

      response = await fetch(LYZR_UPLOAD_URL, {
        method: 'POST',
        headers: {
          'x-api-key': LYZR_API_KEY,
        },
        body: uploadFormData,
      })

      responseText = await response.text()
      try {
        data = JSON.parse(responseText)
      } catch {
        data = { _raw: responseText }
      }

      // If we got a successful response with identifiable asset IDs, break
      if (response.ok) {
        const testIds = deepExtractAssetIds(data)
        if (testIds.length > 0) break
      }

      // If the response indicates wrong field name (422 or specific error), try next
      if (response.status === 422 || response.status === 400) {
        continue
      }

      // For any other response, don't retry with different field name
      break
    }

    if (!response) {
      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: files.length,
          successful_uploads: 0,
          failed_uploads: files.length,
          message: 'Failed to connect to upload API',
          timestamp: new Date().toISOString(),
          error: 'No response received from upload API',
        },
        { status: 500 }
      )
    }

    if (response.ok) {
      // Deep-extract asset IDs from whatever structure Lyzr returns
      const assetIds = deepExtractAssetIds(data)

      // Also try to build file info from the response
      let uploadedFiles: any[] = []
      const resultArrays = data.results || data.files || (Array.isArray(data) ? data : null)
      if (Array.isArray(resultArrays)) {
        uploadedFiles = resultArrays.map((r: any) => ({
          asset_id: r.asset_id || r.assetId || r.id || r._id || r.file_id || '',
          file_name: r.file_name || r.filename || r.name || r.original_name || '',
          success: r.success ?? true,
          error: r.error,
        }))
      } else if (assetIds.length > 0) {
        uploadedFiles = assetIds.map((id) => ({
          asset_id: id,
          file_name: fileEntries[0]?.name || '',
          success: true,
        }))
      }

      return NextResponse.json({
        success: assetIds.length > 0,
        asset_ids: assetIds,
        files: uploadedFiles,
        total_files: data.total_files || files.length,
        successful_uploads: assetIds.length,
        failed_uploads: assetIds.length > 0 ? 0 : files.length,
        message: assetIds.length > 0
          ? `Successfully uploaded ${assetIds.length} file(s)`
          : 'Upload completed but no asset IDs found in response',
        timestamp: new Date().toISOString(),
        _debug: assetIds.length === 0 ? {
          raw_keys: typeof data === 'object' ? Object.keys(data) : [],
          raw_response: responseText.substring(0, 500),
          status: response.status,
        } : undefined,
      })
    } else {
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
          error: data?.detail || data?.message || data?.error || responseText.substring(0, 300),
        },
        { status: response.status }
      )
    }
  } catch (error) {
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
