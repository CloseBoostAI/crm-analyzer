"use client"

import { useEffect, useRef } from "react"

export function BarChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

    // Set dimensions
    const width = canvasRef.current.width
    const height = canvasRef.current.height
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    // Data
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    const sentData = [120, 150, 180, 210, 230, 247]
    const responseData = [72, 90, 115, 140, 155, 168]

    // Calculate scales
    const maxValue = Math.max(...sentData) * 1.1
    const barWidth = chartWidth / months.length / 3
    const barSpacing = barWidth / 2

    // Draw axes
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, height - padding)
    ctx.lineTo(width - padding, height - padding)
    ctx.strokeStyle = "#ddd"
    ctx.stroke()

    // Draw bars
    months.forEach((month, i) => {
      const x1 = padding + i * (chartWidth / months.length) + chartWidth / months.length / 2 - barWidth - barSpacing / 2
      const x2 = x1 + barWidth + barSpacing

      // Sent emails bar
      const sentHeight = (sentData[i] / maxValue) * chartHeight
      ctx.fillStyle = "rgba(59, 130, 246, 0.8)"
      ctx.fillRect(x1, height - padding - sentHeight, barWidth, sentHeight)

      // Response bar
      const responseHeight = (responseData[i] / maxValue) * chartHeight
      ctx.fillStyle = "rgba(16, 185, 129, 0.8)"
      ctx.fillRect(x2, height - padding - responseHeight, barWidth, responseHeight)

      // Month label
      ctx.fillStyle = "#888"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.fillText(
        month,
        padding + i * (chartWidth / months.length) + chartWidth / months.length / 2,
        height - padding + 20,
      )
    })

    // Draw legend
    ctx.fillStyle = "rgba(59, 130, 246, 0.8)"
    ctx.fillRect(width - padding - 100, padding, 10, 10)
    ctx.fillStyle = "#888"
    ctx.textAlign = "left"
    ctx.fillText("Emails Sent", width - padding - 85, padding + 10)

    ctx.fillStyle = "rgba(16, 185, 129, 0.8)"
    ctx.fillRect(width - padding - 100, padding + 20, 10, 10)
    ctx.fillStyle = "#888"
    ctx.fillText("Responses", width - padding - 85, padding + 30)
  }, [])

  return <canvas ref={canvasRef} width={800} height={300} className="w-full h-full" />
}

export function LineChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

    // Set dimensions
    const width = canvasRef.current.width
    const height = canvasRef.current.height
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    // Data
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    const data = [48, 42, 36, 30, 28, 24] // Hours to response

    // Calculate scales
    const maxValue = Math.max(...data) * 1.1

    // Draw axes
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, height - padding)
    ctx.lineTo(width - padding, height - padding)
    ctx.strokeStyle = "#ddd"
    ctx.stroke()

    // Draw line
    ctx.beginPath()
    months.forEach((month, i) => {
      const x = padding + i * (chartWidth / (months.length - 1))
      const y = height - padding - (data[i] / maxValue) * chartHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }

      // Draw point
      ctx.fillStyle = "rgba(244, 63, 94, 0.8)"
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()

      // Month label
      ctx.fillStyle = "#888"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.fillText(month, x, height - padding + 20)

      // Value label
      ctx.fillStyle = "#888"
      ctx.textAlign = "center"
      ctx.fillText(`${data[i]}h`, x, y - 10)
    })

    ctx.strokeStyle = "rgba(244, 63, 94, 0.8)"
    ctx.lineWidth = 2
    ctx.stroke()

    // Y-axis labels
    ctx.fillStyle = "#888"
    ctx.textAlign = "right"
    ctx.fillText("0h", padding - 10, height - padding + 5)
    ctx.fillText(`${Math.round(maxValue)}h`, padding - 10, padding + 5)
  }, [])

  return <canvas ref={canvasRef} width={800} height={300} className="w-full h-full" />
}

export function PieChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

    // Set dimensions
    const width = canvasRef.current.width
    const height = canvasRef.current.height
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(centerX, centerY) - 60

    // Data
    const templates = [
      { name: "Post-Demo", value: 42, color: "rgba(59, 130, 246, 0.8)" },
      { name: "Pricing", value: 28, color: "rgba(16, 185, 129, 0.8)" },
      { name: "Support", value: 18, color: "rgba(244, 63, 94, 0.8)" },
      { name: "Other", value: 12, color: "rgba(168, 85, 247, 0.8)" },
    ]

    const total = templates.reduce((sum, template) => sum + template.value, 0)

    // Draw pie
    let startAngle = 0
    templates.forEach((template, i) => {
      const sliceAngle = (template.value / total) * 2 * Math.PI

      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle)
      ctx.closePath()

      ctx.fillStyle = template.color
      ctx.fill()

      // Draw label
      const labelAngle = startAngle + sliceAngle / 2
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7)
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7)

      ctx.fillStyle = "white"
      ctx.font = "bold 14px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(`${template.value}%`, labelX, labelY)

      startAngle += sliceAngle
    })

    // Draw legend
    const legendX = width - 150
    const legendY = 50

    templates.forEach((template, i) => {
      const y = legendY + i * 25

      ctx.fillStyle = template.color
      ctx.fillRect(legendX, y, 15, 15)

      ctx.fillStyle = "#888"
      ctx.font = "14px Arial"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(template.name, legendX + 25, y + 7)
    })
  }, [])

  return <canvas ref={canvasRef} width={800} height={300} className="w-full h-full" />
}

