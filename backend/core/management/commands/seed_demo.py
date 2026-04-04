from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import AssetRegistry, User


DEMO_ASSETS = [
    {
        'nama_gedung': 'Kilang Balongan - Unit Distilasi',
        'lokasi_gps': '-6.3413, 108.3476',
        'lpl_grade': 'I',
        'tahun_instalasi': 2015,
        'resistivitas_tanah': 25.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Fasilitas pengolahan minyak bumi, LPS dipasang sesuai standar IEC 62305.',
    },
    {
        'nama_gedung': 'Menara BTS Cinere',
        'lokasi_gps': '-6.3335, 106.7860',
        'lpl_grade': 'IV',
        'tahun_instalasi': 2005,
        'resistivitas_tanah': 8.5,
        'jenis_material_konduktor': 'Aluminium',
        'catatan': 'Resistivitas tanah rendah (8.5 Ω·m) → korosi aktif. Perlu pengecekan berkala.',
    },
    {
        'nama_gedung': 'Gardu Induk PLN Suralaya',
        'lokasi_gps': '-6.0095, 106.0375',
        'lpl_grade': 'II',
        'tahun_instalasi': 2018,
        'resistivitas_tanah': 15.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Gardu induk 500kV, area terbuka tinggi.',
    },
    {
        'nama_gedung': 'Gedung Lab STEI ITB',
        'lokasi_gps': '-6.8912, 107.6107',
        'lpl_grade': 'III',
        'tahun_instalasi': 2020,
        'resistivitas_tanah': 30.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Gedung laboratorium elektronika dan informatika.',
    },
    {
        'nama_gedung': 'Tangki LPG Cilacap',
        'lokasi_gps': '-7.7268, 109.0154',
        'lpl_grade': 'I',
        'tahun_instalasi': 2000,
        'resistivitas_tanah': 6.0,
        'jenis_material_konduktor': 'Tembaga',
        'catatan': 'Tangki penyimpanan LPG, resistivitas tanah sangat rendah (6.0 Ω·m) → korosi agresif.',
    },
]


class Command(BaseCommand):
    help = 'Seed the database with demo assets and a default technician user'

    def handle(self, *args, **options):
        self.stdout.write('Seeding demo data...')

        # Create default user
        user, created = User.objects.get_or_create(
            nama_lengkap='Teknisi Demo',
            defaults={'role': 'Teknisi'},
        )
        if created:
            self.stdout.write(f'  Created user: {user.nama_lengkap}')
        else:
            self.stdout.write(f'  User already exists: {user.nama_lengkap}')

        # Create manager user
        manager, created = User.objects.get_or_create(
            nama_lengkap='Manajer Fasilitas',
            defaults={'role': 'Manajer'},
        )
        if created:
            self.stdout.write(f'  Created user: {manager.nama_lengkap}')

        # Create assets
        for asset_data in DEMO_ASSETS:
            asset, created = AssetRegistry.objects.get_or_create(
                nama_gedung=asset_data['nama_gedung'],
                defaults=asset_data,
            )
            if created:
                self.stdout.write(f'  Created asset: {asset.nama_gedung} (LPL {asset.lpl_grade})')
            else:
                self.stdout.write(f'  Asset already exists: {asset.nama_gedung}')

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! {AssetRegistry.objects.count()} assets, {User.objects.count()} users in database.'
        ))
        self.stdout.write('\nDemo assets with corrosion penalty (soil < 10 Ω·m):')
        for a in AssetRegistry.objects.filter(resistivitas_tanah__lt=10):
            self.stdout.write(f'  - {a.nama_gedung}: {a.resistivitas_tanah} Ω·m')
