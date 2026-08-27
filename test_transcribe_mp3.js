const FormData = require('form-data');
const fs = require('fs');

async function transcribe(audioPath, lang) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioPath));
  formData.append('model', 'whisper-large-v3');
  formData.append('language', lang);
  formData.append('response_format', 'json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error (${response.status}): ${error}`);
  }

  const result = await response.json();
  return result.text;
}

(async () => {
  try {
    console.log('🎙️  Transcrevendo (MP3)...\n');
    
    const ptText = await transcribe('/tmp/pt-clean.mp3', 'pt');
    console.log('PT:', ptText);
    
    const enText = await transcribe('/tmp/en-clean.mp3', 'en');
    console.log('\nEN:', enText);
    
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
})();
