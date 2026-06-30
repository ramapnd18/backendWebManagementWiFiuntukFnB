import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  provider: process.env.LLM_PROVIDER ?? 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
}));
