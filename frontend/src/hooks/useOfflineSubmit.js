import { useState } from 'react'
import client from '../api/client'
import { addToSyncQueue } from '../offline/db'
import { localFuzzyApprox } from '../offline/fuzzyLookupTable'
import useNetworkStatus from './useNetworkStatus'

const SEVERITY = {
  OK: 0, Terkorosi: 0.1, Rusak: 0.2, Meleleh: 0.3,
  Klem_Lepas: 0.15, Bengkok: 0.25, Putus: 0.4,
  High_Resistance: 0.2,
}

export default function useOfflineSubmit() {
  const { isOnline } = useNetworkStatus()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitEvent = async (eventData, asset) => {
    setIsSubmitting(true)
    try {
      if (isOnline) {
        const response = await client.post('/events/', eventData)
        return { ...response.data, provisional: false }
      } else {
        const localResult = localFuzzyApprox(
          eventData.estimasi_arus_puncak_ka,
          asset.lpl_grade,
          asset.skor_kesehatan_aset
        )
        await addToSyncQueue({
          type: 'event',
          payload: eventData,
          localResult,
          asset_nama: asset.nama_gedung,
        })
        return {
          ...eventData,
          rasio_stres: localResult.r_stress,
          fuzzy_output_score: localResult.score,
          fuzzy_output_label: localResult.label,
          provisional: true,
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitInspection = async (inspectionData, asset) => {
    setIsSubmitting(true)
    try {
      if (isOnline) {
        const response = await client.post('/inspections/', inspectionData)
        return { ...response.data, provisional: false }
      } else {
        await addToSyncQueue({
          type: 'inspection',
          payload: inspectionData,
          asset_nama: asset.nama_gedung,
        })
        const actualDamage = Math.min(
          (SEVERITY[inspectionData.status_air_terminal] || 0) +
          (SEVERITY[inspectionData.status_down_conductor] || 0) +
          (SEVERITY[inspectionData.status_grounding] || 0),
          1.0
        )
        const healthAfter = Math.max(asset.skor_kesehatan_aset - actualDamage * 0.5, 0.0)
        return {
          health_before: asset.skor_kesehatan_aset,
          health_after: healthAfter,
          provisional: true,
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return { submitEvent, submitInspection, isSubmitting, isOnline }
}
