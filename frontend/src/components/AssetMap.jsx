import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { getHealthStatus, formatDate } from '../utils/constants'

const INDONESIA_CENTER = [-2.5, 118.0]
const DEFAULT_ZOOM = 5

export default function AssetMap({ assets = [], height = '400px' }) {
  const navigate = useNavigate()

  return (
    <MapContainer
      center={INDONESIA_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height, width: '100%', borderRadius: '0.75rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {assets.map((asset) => {
        const [lat, lng] = (asset.lokasi_gps || '0, 0')
          .split(',')
          .map((s) => parseFloat(s.trim()))
        if (isNaN(lat) || isNaN(lng)) return null

        const color = getHealthStatus(asset.skor_kesehatan_aset)

        return (
          <CircleMarker
            key={asset.asset_id}
            center={[lat, lng]}
            radius={12}
            pathOptions={{
              color: color.bg,
              fillColor: color.bg,
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
                    <span>Kesehatan:</span>
                    <span
                      className="font-semibold"
                      style={{ color: color.bg }}
                    >
                      {Math.round((asset.skor_kesehatan_aset ?? 0) * 100)}%
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
  )
}
