# apps/nlp-service/app/model/preprocess.py

# Stop words bahasa Indonesia buatan sendiri agar tidak ada dependensi eksternal
INDON_STOP_WORDS = [
    'dan', 'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'untuk', 'dengan', 
    'ada', 'adalah', 'akan', 'pada', 'juga', 'saya', 'kami', 'mereka', 
    'dia', 'ia', 'kita', 'kamu', 'kalian', 'sangat', 'banyak', 'bisa', 
    'dapat', 'oleh', 'karena', 'telah', 'sudah', 'atau', 'saja', 'tapi', 
    'tetapi', 'seperti', 'maka', 'namun', 'jika', 'kalau', 'supaya', 
    'agar', 'bahwa', 'secara', 'kembali', 'dalam', 'tentang', 'tersebut',
    'yang', 'untuk', 'dengan', 'pada', 'sebagai', 'adalah', 'yaitu', 'yakni',
    'oleh', 'karena', 'sehingga', 'maka', 'namun', 'tetapi', 'melainkan',
    'serta', 'atau', 'dan', 'ini', 'itu', 'tersebut', 'dia', 'mereka', 'kami'
]

# Kamus normalisasi kata tidak baku, singkatan, dan istilah lokal
SLANG_MAP = {
    # Infrastruktur & Fasilitas Umum
    'lobang': 'lubang',
    'lobangan': 'lubang',
    'bolong': 'lubang',
    'bolongan': 'lubang',
    'lubang': 'lubang',
    'dijalan': 'di jalan',
    'jln': 'jalan',
    'jl': 'jalan',
    'pju': 'penerangan jalan umum',
    'mati': 'mati',
    'padam': 'mati',
    'rusak': 'rusak',
    'ancur': 'hancur',
    'hancur': 'hancur',
    'got': 'selokan',
    'selokan': 'selokan',
    'mampet': 'tersumbat',
    'kesumbat': 'tersumbat',
    'sumbat': 'tersumbat',
    'jembatan': 'jembatan',
    'trotoar': 'trotoar',
    'jalan': 'jalan',
    'paving': 'jalan',
    'pipa': 'pipa',
    'bocor': 'bocor',
    'tiang': 'tiang',
    'ambrol': 'ambrol',
    'pagar': 'pagar',
    'halte': 'halte',
    'flyover': 'flyover',
    
    # Singkatan / Slang Umum
    'yg': 'yang',
    'dgn': 'dengan',
    'bgt': 'banget',
    'mpe': 'sampai',
    'ampe': 'sampai',
    'sampe': 'sampai',
    'ga': 'tidak',
    'gak': 'tidak',
    'nggak': 'tidak',
    'ndak': 'tidak',
    'kalo': 'kalau',
    'klo': 'kalau',
    'dr': 'dari',
    'tks': 'terima kasih',
    'trims': 'terima kasih',
    'thx': 'terima kasih',
    'makasih': 'terima kasih',
    'tolong': 'tolong',
    'tlg': 'tolong',
    'plis': 'tolong',
    'banyak': 'banyak',
    'bnyk': 'banyak',
    'malah': 'malah',
    'nih': 'nih',
    'kok': 'kok',
    'sih': 'sih',
    'mpe': 'sampai',
    
    # Layanan Publik / Administrasi
    'ktp': 'kartu tanda penduduk',
    'bpjs': 'bpjs',
    'bansos': 'bantuan sosial',
    'bantuan': 'bantuan',
    'loket': 'loket',
    'antrean': 'antrean',
    'antri': 'antrean',
    'kantor': 'kantor',
    'petugas': 'petugas',
    'pelayanan': 'pelayanan',
    'layanan': 'pelayanan',
    'rs': 'rumah sakit',
    'puskesmas': 'puskesmas',
    'kelurahan': 'kelurahan',
    'kecamatan': 'kecamatan',
    'pungli': 'pungutan liar',
    'duit': 'uang',
    'uang': 'uang',
    
    # Lingkungan
    'kotor': 'kotor',
    'numpuk': 'menumpuk',
    'menumpuk': 'menumpuk',
    'tumpukan': 'menumpuk',
    'sampah': 'sampah',
    'bau': 'bau',
    'busuk': 'bau',
    'bakar': 'bakar',
    'asap': 'asap',
    'sesak': 'sesak',
    'banjir': 'banjir',
    'genangan': 'banjir',
    'limbah': 'limbah',
    'pabrik': 'pabrik',
    'kali': 'sungai',
    'sungai': 'sungai',
    'taman': 'taman'
}

def clean_text(text: str) -> str:
    """Membersihkan dan menormalisasi teks laporan pengaduan."""
    if not text:
        return ""
    # Case folding (huruf kecil)
    text = text.lower()
    # Hapus tanda baca/angka sederhana (tetap menyisakan karakter alfabet dan spasi)
    cleaned = "".join([char if (char.isalpha() or char.isspace()) else " " for char in text])
    
    words = cleaned.split()
    normalized_words = []
    
    for word in words:
        # Penanganan kata depan 'di' yang digabung (misal: dijalan, diselokan, dijembatan)
        if word.startswith('di') and len(word) > 2:
            base_word = word[2:]
            if base_word in ['jalan', 'sungai', 'selokan', 'rumah', 'kantor', 'taman', 'tps', 'halte', 'jembatan', 'lokasi', 'kelurahan', 'kecamatan']:
                normalized_words.extend(['di', base_word])
                continue
                
        # Konversi kata tidak baku atau singkatan sesuai kamus slang
        if word in SLANG_MAP:
            normalized_words.extend(SLANG_MAP[word].split())
        else:
            normalized_words.append(word)
            
    return " ".join(normalized_words)
