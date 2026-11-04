import { predictCategory } from '../services/nlpClient';

describe('nlpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('harus mengembalikan null jika input teks kosong atau whitespace', async () => {
    const resEmpty = await predictCategory('');
    expect(resEmpty).toBeNull();

    const resWhitespace = await predictCategory('   ');
    expect(resWhitespace).toBeNull();
  });

  it('harus mengembalikan hasil prediksi dengan uncertain=false ketika NLP service yakin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ category: 'Infrastruktur', confidence: 0.88, uncertain: false }),
    } as any);

    const result = await predictCategory('Jalan berlubang parah di perempatan');
    expect(result).toEqual({
      category: 'Infrastruktur',
      confidence: 0.88,
      uncertain: false,
    });
  });

  it('harus meneruskan flag uncertain=true ketika NLP service tidak yakin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ category: 'infrastruktur', confidence: 0.35, uncertain: true }),
    } as any);

    const result = await predictCategory('halo');
    expect(result).toEqual({
      category: 'infrastruktur',
      confidence: 0.35,
      uncertain: true,
    });
  });

  it('harus mengembalikan null ketika respons HTTP service bukan 2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const result = await predictCategory('Tes error');
    expect(result).toBeNull();
  });

  it('harus menangani timeout/abort secara aman dan mengembalikan null', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const result = await predictCategory('Jalan rusak sangat panjang...');
    expect(result).toBeNull();
  });
});
