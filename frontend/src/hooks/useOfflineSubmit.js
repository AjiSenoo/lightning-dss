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

  const submitInspection = async (
    inspectionData,
    asset,
    photoBlobs = [],
    mode = 'create',
    logId = null,
  ) => {
    setIsSubmitting(true)
    try {
      if (isOnline) {
        const fd = new FormData()
        Object.entries(inspectionData).forEach(([k, v]) => {
          if (v !== null && v !== undefined) fd.append(k, v)
        })
        photoBlobs.forEach((blob, i) => fd.append('photos', blob, `photo_${i + 1}.jpg`))
        let response
        if (mode === 'edit' && logId) {
          response = await client.put(`/inspections/${logId}/`, fd)
        } else if (mode === 'amend' && logId) {
          response = await client.post(`/inspections/${logId}/amend/`, fd)
        } else {
          response = await client.post('/inspections/', fd)
        }
        return { ...response.data, provisional: false }
      } else {
        // Edit/amend require online — queueing them is risky because the source row may
        // have changed by the time we sync. Surface this clearly.
        if (mode !== 'create') {
          throw new Error('Edit dan amandemen hanya tersedia saat online.')
        }
        await addToSyncQueue({
          type: 'inspection',
          payload: inspectionData,
          photoBlobs,
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

  // Asset/component mutations: run online, or queue for replay when offline.
  // Returns { queued: boolean, data }.
  const submitMaintenance = async (payload) => {
    if (isOnline) {
      const res = await client.post('/maintenance-actions/', payload)
      return { queued: false, data: res.data }
    }
    await addToSyncQueue({ type: 'maintenance', payload })
    return { queued: true, data: null }
  }

  const submitAssetReplace = async (assetId, payload) => {
    if (isOnline) {
      const res = await client.post(`/assets/${assetId}/replace/`, payload)
      return { queued: false, data: res.data }
    }
    await addToSyncQueue({ type: 'asset_replace', assetId, payload })
    return { queued: true, data: null }
  }

  const submitAssetDelete = async (assetId) => {
    if (isOnline) {
      await client.delete(`/assets/${assetId}/`)
      return { queued: false, data: null }
    }
    await addToSyncQueue({ type: 'asset_delete', assetId })
    return { queued: true, data: null }
  }

  return {
    submitEvent, submitInspection,
    submitMaintenance, submitAssetReplace, submitAssetDelete,
    isSubmitting, isOnline,
  }
}
