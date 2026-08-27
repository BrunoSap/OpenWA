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
    console.log('🎙️  Transcrevendo seus áudios...\n');
    
    // PT
    const ptText = await transcribe('test/fixtures/audio/pt-clean-sample.ogg', 'pt');
    console.log('PT transcrito:', ptText);
    console.log('');
    
    // EN
    const enText = await transcribe('test/fixtures/audio/en-clean-sample.ogg', 'en');
    console.log('EN transcrito:', enText);
    
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
})();
