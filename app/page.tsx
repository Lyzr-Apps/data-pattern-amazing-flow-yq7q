'use client'

import { useState, useCallback, useRef } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import type { AIAgentResponse } from '@/lib/aiAgent'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  FiUpload,
  FiFile,
  FiTrendingUp,
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiRefreshCw,
  FiBarChart2,
  FiSearch,
  FiX,
  FiDatabase,
  FiGrid,
  FiZap,
  FiTarget,
  FiInfo,
} from 'react-icons/fi'

const AGENT_ID = '6996cd83744b96afe6ba69ee'

// --- TypeScript Interfaces ---

interface KeyFinding {
  finding: string
  importance: string
}

interface DataPattern {
  pattern: string
  details: string
}

interface Anomaly {
  anomaly: string
  severity: string
  details: string
}

interface Recommendation {
  recommendation: string
  priority: string
  rationale: string
}

interface Statistics {
  total_rows: number
  total_columns: number
  key_metrics: string[]
}

interface InsightsResult {
  executive_summary: string
  key_findings: KeyFinding[]
  data_patterns: DataPattern[]
  anomalies: Anomaly[]
  recommendations: Recommendation[]
  statistics: Statistics
}

interface ArtifactFile {
  file_url: string
  name?: string
  format_type?: string
}

// --- Markdown Renderer ---

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-2 mb-0.5">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-sm mt-2 mb-0.5">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-snug">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm leading-snug">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-0.5" />
        return (
          <p key={i} className="text-sm leading-snug">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// --- Utility Functions ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getFileExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ext
}

function getLevelBadgeClass(level: string): string {
  const l = (level ?? '').toLowerCase()
  if (l === 'high') return 'bg-red-100 text-red-700 border-red-200'
  if (l === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (l === 'low') return 'bg-slate-100 text-slate-600 border-slate-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function getLevelDot(level: string): string {
  const l = (level ?? '').toLowerCase()
  if (l === 'high') return 'bg-red-500'
  if (l === 'medium') return 'bg-amber-500'
  return 'bg-slate-400'
}

// --- Sample Data ---

const SAMPLE_INSIGHTS: InsightsResult = {
  executive_summary:
    'Analysis of 12,450 sales transactions across Q1-Q4 2024 reveals a **15.3% year-over-year revenue growth** driven primarily by the Enterprise segment. The West Coast region outperforms all others by 23%, while customer churn in the SMB segment has increased 8% quarter-over-quarter, warranting immediate attention. Product category "Analytics Suite" shows the highest margin at 72%.',
  key_findings: [
    {
      finding: 'Enterprise segment revenue grew 22% YoY, contributing 58% of total revenue.',
      importance: 'high',
    },
    {
      finding: 'Customer acquisition cost decreased by 12% due to improved marketing funnel efficiency.',
      importance: 'high',
    },
    {
      finding: 'Average deal size increased from $34K to $41K across all segments.',
      importance: 'medium',
    },
    {
      finding: 'Q3 showed seasonal dip of 7% which recovered fully in Q4.',
      importance: 'low',
    },
    {
      finding: 'Top 10% of accounts generate 45% of total revenue, indicating concentration risk.',
      importance: 'high',
    },
  ],
  data_patterns: [
    {
      pattern: 'Seasonal Revenue Cycle',
      details: 'Revenue follows a predictable quarterly pattern with Q4 being the strongest (32% of annual) and Q3 the weakest (18% of annual). This aligns with enterprise budget cycles.',
    },
    {
      pattern: 'Regional Growth Divergence',
      details: 'West Coast and Southeast regions are growing at 2x the rate of Midwest and Northeast, suggesting market saturation in legacy territories.',
    },
    {
      pattern: 'Product Mix Shift',
      details: 'Platform products now represent 64% of new bookings vs. 41% a year ago, indicating successful transition to recurring revenue model.',
    },
  ],
  anomalies: [
    {
      anomaly: 'Unusual spike in refund requests during Week 38',
      severity: 'high',
      details: 'Refund rate jumped to 4.2% from a baseline of 1.1%, coinciding with a product update deployment. Root cause traced to billing calculation error.',
    },
    {
      anomaly: 'Three enterprise accounts with negative net revenue',
      severity: 'medium',
      details: 'Accounts #4521, #4533, and #4598 show negative net revenue due to excessive credits and service level agreement penalties.',
    },
  ],
  recommendations: [
    {
      recommendation: 'Implement targeted retention program for SMB segment.',
      priority: 'high',
      rationale: '8% increase in churn rate in SMB represents $2.1M annual revenue at risk. Proactive retention could recover 60% based on industry benchmarks.',
    },
    {
      recommendation: 'Expand West Coast sales team by 30%.',
      priority: 'high',
      rationale: 'West Coast shows highest growth rate and highest win rate (34%) but longest sales cycle due to limited capacity.',
    },
    {
      recommendation: 'Introduce tiered pricing for Analytics Suite.',
      priority: 'medium',
      rationale: 'At 72% margin, there is room to offer entry-level pricing to capture mid-market deals currently lost to competitors.',
    },
    {
      recommendation: 'Automate quarterly business review process.',
      priority: 'low',
      rationale: 'Manual QBR preparation consumes 120 hours per quarter. Automation can reduce this by 80% and improve consistency.',
    },
  ],
  statistics: {
    total_rows: 12450,
    total_columns: 24,
    key_metrics: [
      'Total Revenue: $47.2M',
      'Avg Deal Size: $41K',
      'Win Rate: 28%',
      'Customer Count: 1,847',
      'Churn Rate: 5.3%',
    ],
  },
}

// --- Sub-Components ---

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2 mb-3">
        <FiSearch className="w-4 h-4 text-muted-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground font-medium">Analyzing your data...</span>
      </div>
      <Card className="border bg-card">
        <CardHeader className="py-3 px-4">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((n) => (
          <Card key={n} className="border bg-card">
            <CardHeader className="py-3 px-4">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border bg-card">
        <CardHeader className="py-3 px-4">
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-8">
      <div className="w-16 h-16 rounded-sm bg-secondary flex items-center justify-center mb-4">
        <FiBarChart2 className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No analysis yet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm leading-snug">
        Upload an Excel or CSV file on the left panel, then click &quot;Analyze Data&quot; to generate insights.
      </p>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-sm bg-card">
      <div className="w-8 h-8 rounded-sm bg-secondary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-foreground font-mono truncate">{String(value)}</p>
      </div>
    </div>
  )
}

function InsightsDisplay({ data, pdfUrl }: { data: InsightsResult; pdfUrl: string | null }) {
  const findings = Array.isArray(data?.key_findings) ? data.key_findings : []
  const patterns = Array.isArray(data?.data_patterns) ? data.data_patterns : []
  const anomalies = Array.isArray(data?.anomalies) ? data.anomalies : []
  const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : []
  const keyMetrics = Array.isArray(data?.statistics?.key_metrics) ? data.statistics.key_metrics : []

  return (
    <div className="space-y-4 p-1">
      {/* Top Row: Stats + Download */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard
            label="Rows"
            value={data?.statistics?.total_rows ?? '--'}
            icon={<FiDatabase className="w-4 h-4 text-muted-foreground" />}
          />
          <StatCard
            label="Columns"
            value={data?.statistics?.total_columns ?? '--'}
            icon={<FiGrid className="w-4 h-4 text-muted-foreground" />}
          />
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FiDownload className="w-3.5 h-3.5" />
              Download Report
            </Button>
          </a>
        )}
      </div>

      {/* Key Metrics */}
      {keyMetrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keyMetrics.map((metric, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-mono px-2 py-0.5">
              {metric}
            </Badge>
          ))}
        </div>
      )}

      <Separator />

      {/* Executive Summary */}
      <Card className="border bg-card">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FiInfo className="w-4 h-4 text-primary" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {renderMarkdown(data?.executive_summary ?? '')}
        </CardContent>
      </Card>

      {/* Key Findings */}
      {findings.length > 0 && (
        <Card className="border bg-card">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FiCheckCircle className="w-4 h-4 text-primary" />
              Key Findings
              <Badge variant="secondary" className="text-[10px] ml-auto font-mono">{findings.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getLevelDot(f?.importance)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{f?.finding ?? ''}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 px-1.5 py-0 ${getLevelBadgeClass(f?.importance)}`}>
                    {f?.importance ?? 'N/A'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Data Patterns */}
      {patterns.length > 0 && (
        <Card className="border bg-card">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-primary" />
              Data Patterns
              <Badge variant="secondary" className="text-[10px] ml-auto font-mono">{patterns.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            {patterns.map((p, i) => (
              <div key={i} className="border-l-2 border-primary/30 pl-3">
                <p className="text-sm font-medium mb-0.5">{p?.pattern ?? ''}</p>
                <p className="text-xs text-muted-foreground leading-snug">{p?.details ?? ''}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <Card className="border bg-card">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4 text-amber-600" />
              Anomalies
              <Badge variant="secondary" className="text-[10px] ml-auto font-mono">{anomalies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            {anomalies.map((a, i) => (
              <div key={i} className="border rounded-sm p-3 bg-background">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{a?.anomaly ?? ''}</p>
                  <Badge variant="outline" className={`text-[10px] shrink-0 px-1.5 py-0 ${getLevelBadgeClass(a?.severity)}`}>
                    {a?.severity ?? 'N/A'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{a?.details ?? ''}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card className="border bg-card">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FiTarget className="w-4 h-4 text-primary" />
              Recommendations
              <Badge variant="secondary" className="text-[10px] ml-auto font-mono">{recommendations.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className="border rounded-sm p-3 bg-background">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium leading-snug">{r?.recommendation ?? ''}</p>
                  <Badge variant="outline" className={`text-[10px] shrink-0 px-1.5 py-0 ${getLevelBadgeClass(r?.priority)}`}>
                    {r?.priority ?? 'N/A'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{r?.rationale ?? ''}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Main Page ---

export default function Page() {
  // File state
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [assetIds, setAssetIds] = useState<string[]>([])

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [insights, setInsights] = useState<InsightsResult | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Session for agent events
  const [sessionId, setSessionId] = useState<string | null>(null)
  const agentEvents = useLyzrAgentEvents(sessionId)

  // Sample data toggle
  const [showSample, setShowSample] = useState(false)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)

  // Active agent tracking
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv']

  const validateFile = useCallback(
    (f: File): boolean => {
      const ext = getFileExtension(f.name)
      const acceptedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ]
      if (!ACCEPTED_EXTENSIONS.includes(ext) && !acceptedTypes.includes(f.type)) {
        setFileError('Unsupported format. Please upload .xlsx or .csv files only.')
        return false
      }
      setFileError(null)
      return true
    },
    []
  )

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      if (!validateFile(selectedFile)) return
      setFile(selectedFile)
      setFileError(null)
      setError(null)
      setInsights(null)
      setPdfUrl(null)
      setAssetIds([])

      // Upload immediately
      setUploading(true)
      try {
        const uploadResult = await uploadFiles(selectedFile)
        if (uploadResult.success && Array.isArray(uploadResult.asset_ids) && uploadResult.asset_ids.length > 0) {
          setAssetIds(uploadResult.asset_ids)
        } else {
          setFileError(uploadResult.error ?? 'Upload failed. Please try again.')
        }
      } catch {
        setFileError('Upload failed. Please check your connection and try again.')
      }
      setUploading(false)
    },
    [validateFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) handleFileSelect(dropped)
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) handleFileSelect(selected)
    },
    [handleFileSelect]
  )

  const handleAnalyze = useCallback(async () => {
    if (assetIds.length === 0) return
    setAnalyzing(true)
    setError(null)
    setInsights(null)
    setPdfUrl(null)
    setActiveAgentId(AGENT_ID)
    agentEvents.setProcessing(true)

    try {
      const result: AIAgentResponse = await callAIAgent(
        'Analyze this data file and provide a comprehensive executive summary with key findings, data patterns, anomalies, recommendations, and statistics.',
        AGENT_ID,
        { assets: assetIds }
      )

      if (result?.session_id) {
        setSessionId(result.session_id)
      }

      if (result?.success) {
        let parsedResult = result?.response?.result
        if (typeof parsedResult === 'string') {
          try {
            parsedResult = JSON.parse(parsedResult)
          } catch {
            parsedResult = { executive_summary: parsedResult }
          }
        }
        setInsights(parsedResult as InsightsResult)

        // Extract PDF URL
        const artifacts = result?.module_outputs?.artifact_files
        if (Array.isArray(artifacts) && artifacts.length > 0) {
          const url = (artifacts[0] as ArtifactFile)?.file_url
          if (url) setPdfUrl(url)
        }
      } else {
        setError(result?.error ?? result?.response?.message ?? 'Analysis failed. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    }

    setAnalyzing(false)
    setActiveAgentId(null)
    agentEvents.setProcessing(false)
  }, [assetIds, agentEvents])

  const handleReset = useCallback(() => {
    setFile(null)
    setFileError(null)
    setAssetIds([])
    setInsights(null)
    setPdfUrl(null)
    setError(null)
    setAnalyzing(false)
    setUploading(false)
    setShowSample(false)
    setActiveAgentId(null)
    setSessionId(null)
    agentEvents.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [agentEvents])

  // Determine what to show on the right panel
  const displayInsights = showSample ? SAMPLE_INSIGHTS : insights
  const displayPdfUrl = showSample ? null : pdfUrl

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans" style={{ lineHeight: '1.3' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b bg-card">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-sm bg-primary flex items-center justify-center">
            <FiBarChart2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">DataLens</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">Excel Data Insights Generator</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">
            Sample Data
          </label>
          <Switch
            id="sample-toggle"
            checked={showSample}
            onCheckedChange={setShowSample}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-[340px] shrink-0 border-r bg-card flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Upload Dropzone */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upload File</h2>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-sm p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-secondary/50'}`}
              >
                <FiUpload className={`w-6 h-6 mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="text-sm font-medium text-foreground mb-0.5">
                  {isDragging ? 'Drop file here' : 'Drag & drop or click to browse'}
                </p>
                <p className="text-xs text-muted-foreground">.xlsx, .csv files accepted</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>

            {/* File Error */}
            {fileError && (
              <div className="flex items-start gap-2 p-3 border border-destructive/30 rounded-sm bg-destructive/5">
                <FiAlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive leading-snug">{fileError}</p>
              </div>
            )}

            {/* File Preview */}
            {file && (
              <Card className="border bg-card">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-sm bg-secondary flex items-center justify-center shrink-0">
                      <FiFile className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                          {getFileExtension(file.name).toUpperCase()}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReset()
                      }}
                      className="p-1 hover:bg-secondary rounded-sm transition-colors"
                    >
                      <FiX className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {uploading && (
                    <div className="mt-2 flex items-center gap-2">
                      <FiRefreshCw className="w-3 h-3 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    </div>
                  )}
                  {assetIds.length > 0 && !uploading && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <FiCheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Ready for analysis</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleAnalyze}
                disabled={assetIds.length === 0 || analyzing || uploading}
                className="w-full gap-2"
                size="sm"
              >
                {analyzing ? (
                  <>
                    <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FiZap className="w-3.5 h-3.5" />
                    Analyze Data
                  </>
                )}
              </Button>
              {(file || insights) && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full gap-2"
                  size="sm"
                  disabled={analyzing}
                >
                  <FiRefreshCw className="w-3.5 h-3.5" />
                  New Analysis
                </Button>
              )}
            </div>
          </div>

          {/* Agent Info */}
          <div className="border-t p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Agent</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${activeAgentId ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">Data Insights Agent</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{AGENT_ID}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 min-w-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-5 max-w-3xl">
              {/* Error State */}
              {error && !analyzing && (
                <Card className="border border-destructive/30 bg-destructive/5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FiAlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive mb-1">Analysis Failed</p>
                        <p className="text-xs text-destructive/80 leading-snug">{error}</p>
                        <Button
                          onClick={handleAnalyze}
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-1.5"
                          disabled={assetIds.length === 0}
                        >
                          <FiRefreshCw className="w-3 h-3" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Loading State */}
              {analyzing && <LoadingSkeleton />}

              {/* Results */}
              {!analyzing && displayInsights && (
                <InsightsDisplay data={displayInsights} pdfUrl={displayPdfUrl} />
              )}

              {/* Empty State */}
              {!analyzing && !displayInsights && !error && <EmptyState />}
            </div>
          </ScrollArea>
        </main>
      </div>

      {/* Agent Activity Panel */}
      <AgentActivityPanel
        isConnected={agentEvents.isConnected}
        events={agentEvents.events}
        thinkingEvents={agentEvents.thinkingEvents}
        lastThinkingMessage={agentEvents.lastThinkingMessage}
        activeAgentId={agentEvents.activeAgentId}
        activeAgentName={agentEvents.activeAgentName}
        isProcessing={agentEvents.isProcessing}
      />
    </div>
  )
}
