/**
 * LLM Provider Interface
 * Abstraksi untuk semua provider AI (OpenAI, Anthropic, Gemini).
 * Implementasi baru cukup mengimplementasikan interface ini
 * tanpa mengubah AiService.
 */
export interface LlmProvider {
  /**
   * Kirim konfigurasi MikroTik ke LLM dan dapatkan hasil analisis.
   * @param configJson - Konfigurasi hotspot MikroTik dalam format JSON string
   * @returns Hasil analisis dalam format Markdown
   */
  analyze(configJson: string): Promise<string>;
}
