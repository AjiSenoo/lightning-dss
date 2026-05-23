import { useEffect, useRef, useState } from 'react'
import { MapContainer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { tileLayerOffline, savetiles } from 'leaflet.offline'
import { useNavigate } from 'react-router-dom'
import { HEALTH_BAND_HEX, HEALTH_BAND_LABEL, scoreToBand, formatDate } from '../utils/constants'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const INDONESIA_CENTER = [-2.5, 118.0]
const DEFAULT_ZOOM = 5
const CACHE_ZOOM_LEVELS = [8, 9, 10, 11, 12, 13, 14]

// Compute L.LatLngBounds from asset list, or null if empty/invalid
function assetBounds(assets) {
  const coords = assets
    .map((a) => {
      const [lat, lng] = (a.lokasi_gps || '').split(',').map((s) => parseFloat(s.trim()))
      return isNaN(lat) || isNaN(lng) ? null : [lat, lng]
    })
    .filter(Boolean)
  if (coords.length === 0) return null
  const lats = coords.map(([lat]) => lat)
  const lngs = coords.map(([, lng]) => lng)
  const pad = 0.5
  return [
    [Math.min(...lats) - pad, Math.min(...lngs) - pad],
    [Math.max(...lats) + pad, Math.max(...lngs) + pad],
  ]
}

// Rendered inside MapContainer — wires up offline tile layer + save control
function OfflineController({ assets, saveRef }) {
  const map = useMap()

  useEffect(() => {
    const tileLayer = tileLayerOffline(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 })
    tileLayer.addTo(map)

    const bounds = assetBounds(assets)
    const control = savetiles(tileLayer, {
      zoomlevels: CACHE_ZOOM_LEVELS,
      bounds: bounds ? map.options.crs?.latLngBoundsToLayerBounds?.(bounds) ?? bounds : null,
      confirm: (status, successCallback) => successCallback(),
      confirmRemoval: (status, successCallback) => successCallback(),
      saveText: '+',
      rmText: '-',
    })
    // Don't add the control to the map — we render our own React button
    // The control still needs _map set for _calculateTiles to work
    control._map = map

    // Set bounds on control so it caches the asset area regardless of viewport
    if (bounds) {
      const L = map.options.crs ? window.L : null
      if (L) {
        control.options.bounds = L.latLngBounds(bounds)
      } else {
        // fallback: let it use current viewport
        control.options.bounds = null
      }
    }

    // Expose save trigger and event source to parent
    saveRef.current = {
      trigger: () => control._saveTiles.call(control),
      tileLayer,
    }

    return () => {
      tileLayer.remove()
      saveRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return null
}

export default function AssetMap({ assets = [], height = '400px' }) {
  const navigate = useNavigate()
  const saveRef = useRef(null)
  const [cacheState, setCacheState] = useState(null) // null | {saved, total}

  const handleCache = () => {
    if (!saveRef.current) return
    const { tileLayer, trigger } = saveRef.current

    tileLayer.off('savestart savetileend saveend')

    tileLayer.on('savestart', (e) =>
      setCacheState({ saved: 0, total: e.lengthToBeSaved })
    )
    tileLayer.on('savetileend', (e) =>
      setCacheState({ saved: e.lengthSaved, total: e.lengthToBeSaved })
    )
    tileLayer.on('saveend', (e) =>
      setCacheState({ saved: e.lengthSaved, total: e.lengthToBeSaved, done: true })
    )

    trigger()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCache}
            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg"
            disabled={!!cacheState && !cacheState.done}
          >
            Cache peta offline
          </button>
          {cacheState && (
            <span className="text-xs text-gray-500">
              {cacheState.done
                ? `${cacheState.saved} tiles tersimpan`
                : `${cacheState.saved} / ${cacheState.total} tiles...`}
            </span>
          )}
        </div>
      </div>

      <MapContainer
        center={INDONESIA_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height, width: '100%', borderRadius: '0.75rem' }}
      >
        <OfflineController assets={assets} saveRef={saveRef} />
        {assets.map((asset) => {
          const [lat, lng] = (asset.lokasi_gps || '0, 0')
            .split(',')
            .map((s) => parseFloat(s.trim()))
          if (isNaN(lat) || isNaN(lng)) return null

          const band = asset.health_band ?? scoreToBand(asset.ahi_safety ?? asset.skor_kesehatan_aset)
          const hex  = HEALTH_BAND_HEX[band] ?? HEALTH_BAND_HEX.neutral
          const displayScore = asset.ahi_safety ?? asset.skor_kesehatan_aset

          return (
            <CircleMarker
              key={asset.asset_id}
              center={[lat, lng]}
              radius={12}
              pathOptions={{
                color: hex,
                fillColor: hex,
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-bold text-sm">{asset.nama_gedung}</p>
                  <p className="text-xs text-gray-500">LPL {asset.lpl_grade}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Kondisi:</span>
                      <span className="font-semibold" style={{ color: hex }}>
                        {HEALTH_BAND_LABEL[band]} · {Math.round((displayScore ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sambaran terakhir:</span>
                      <span>{formatDate(asset.last_strike)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Inspeksi terakhir:</span>
                      <span>{formatDate(asset.last_inspection)}</span>
                    </div>
                  </div>
                  <button
                    className="mt-2 w-full text-xs bg-blue-600 text-white py-1 rounded"
                    onClick={() => navigate(`/assets/${asset.asset_id}`)}
                  >
                    Lihat Detail
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
