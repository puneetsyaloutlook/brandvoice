const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store brand profiles in memory
let brandProfiles = {};

// Load brand profiles from the brand-profiles folder
function loadBrandProfiles() {
  const profilesDir = './brand-profiles';
  brandProfiles = {}; // Clear existing profiles
  
  try {
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir);
      
      files.forEach(file => {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
          try {
            const content = fs.readFileSync(path.join(profilesDir, file), 'utf8');
            const brandName = path.basename(file, path.extname(file));
            brandProfiles[brandName] = content;
            console.log(`Loaded brand profile: ${brandName}`);
          } catch (error) {
            console.error(`Error loading file ${file}:`, error.message);
          }
        }
      });
      
      console.log(`Total brand profiles loaded: ${Object.keys(brandProfiles).length}`);
    } else {
      console.log('brand-profiles directory does not exist');
    }
  } catch (error) {
    console.error('Error reading brand-profiles directory:', error.message);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Get all brand profiles
app.get('/api/brands', (req, res) => {
  loadBrandProfiles();
  
  const brands = Object.keys(brandProfiles).map(name => ({
    name,
    preview: brandProfiles[name].substring(0, 200) + '...'
  }));
  
  res.json(brands);
});

// Rewrite text using Groq API (free and fast)
async function rewriteWithGroq(text, brandProfile, brandName) {
  const prompt = `You are a professional copywriter. Rewrite the following text to match the exact brand voice and style described in the brand guide below.

BRAND VOICE GUIDE FOR ${brandName.toUpperCase()}:
${brandProfile}

ORIGINAL TEXT TO REWRITE:
"${text}"

INSTRUCTIONS:
- Rewrite the text to perfectly match the brand voice characteristics described above
- Follow all the guidelines, tone, and style rules from the brand guide
- Keep the core message and meaning intact
- Apply the specific vocabulary, sentence structure, and communication style outlined in the guide
- Output ONLY the rewritten text, no explanations or additional content

REWRITTEN TEXT:`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || 'gsk_dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Unknown API error');
    }

    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('Groq API error:', error);
    throw error;
  }
}

// Alternative: Use Hugging Face Inference API with a better model
async function rewriteWithHuggingFace(text, brandProfile, brandName) {
  const prompt = `Brand Voice Guidelines for ${brandName}:
${brandProfile.substring(0, 800)}

Rewrite this text to match the ${brandName} brand voice: "${text}"

Rewritten version:`;

  try {
    // Try different models in order of preference
    const models = [
      'microsoft/DialoGPT-large',
      'facebook/blenderbot-400M-distill',
      'microsoft/DialoGPT-medium'
    ];
    
    for (const model of models) {
      try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 100,
              temperature: 0.8,
              return_full_text: false,
              do_sample: true
            }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          if (!data.error && Array.isArray(data) && data[0]?.generated_text) {
            let result = data[0].generated_text;
            
            // Clean up the response
            result = result.replace(prompt, '').trim();
            result = result.replace(/^["']|["']$/g, ''); // Remove quotes
            result = result.split('\n')[0]; // Take first line only
            
            if (result.length > 10) {
              console.log(`Success with Hugging Face model: ${model}`);
              return result;
            }
          }
        }
      } catch (modelError) {
        console.log(`Model ${model} failed:`, modelError.message);
        continue;
      }
    }
    
    throw new Error('All Hugging Face models failed');
    
  } catch (error) {
    console.error('Hugging Face API error:', error);
    throw error;
  }
}

// Use free Together AI API
async function rewriteWithTogether(text, brandProfile, brandName) {
  const prompt = `You are an expert copywriter. Rewrite the following text to match the ${brandName} brand voice using the guidelines provided.

BRAND VOICE GUIDELINES:
${brandProfile}

TEXT TO REWRITE:
"${text}"

Rewrite this text following the brand guidelines exactly. Output only the rewritten text:`;

  try {
    const response = await fetch('https://api.together.xyz/inference', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY || 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'togethercomputer/llama-2-7b-chat',
        prompt: prompt,
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        repetition_penalty: 1,
        stop: ["\n\n"]
      }),
    });

    if (!response.ok) {
      throw new Error(`Together API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output?.choices?.[0]?.text?.trim() || data.choices?.[0]?.text?.trim() || '';
    
  } catch (error) {
    console.error('Together AI API error:', error);
    throw error;
  }
}

// Fallback to a local LLM-style transformation
function localLLMRewrite(text, brandProfile, brandName) {
  // This simulates what an LLM would do by analyzing the brand profile
  // and applying systematic transformations based on the actual brand content
  
  console.log(`Using local processing for ${brandName}`);
  
  let result = text;
  const profile = brandProfile.toLowerCase();
  
  // Extract specific characteristics from each brand profile
  const brandCharacteristics = extractBrandSpecificRules(brandProfile, brandName);
  
  // Apply brand-specific transformations
  result = applyBrandSpecificTransformations(result, brandCharacteristics, brandName);
  
  // Apply general transformations based on profile content
  result = applyProfileBasedTransformations(result, profile);
  
  return result;
}

function extractBrandSpecificRules(brandProfile, brandName) {
  const rules = {
    tone: 'neutral',
    vocabulary: 'standard',
    sentenceStyle: 'standard',
    specificWords: {},
    avoid: [],
    prefer: []
  };
  
  const lines = brandProfile.split('\n');
  const profile = brandProfile.toLowerCase();
  
  // Analyze tone characteristics
  if (profile.includes('straightforward') || profile.includes('direct')) {
    rules.tone = 'direct';
  } else if (profile.includes('friendly') || profile.includes('warm')) {
    rules.tone = 'friendly';
  } else if (profile.includes('professional') || profile.includes('expert')) {
    rules.tone = 'professional';
  } else if (profile.includes('premium') || profile.includes('luxury')) {
    rules.tone = 'premium';
  } else if (profile.includes('casual') || profile.includes('relaxed')) {
    rules.tone = 'casual';
  }
  
  // Analyze vocabulary preferences
  if (profile.includes('simple') || profile.includes('plain english')) {
    rules.vocabulary = 'simple';
  } else if (profile.includes('technical') || profile.includes('expert')) {
    rules.vocabulary = 'technical';
  } else if (profile.includes('jargon') && profile.includes('avoid')) {
    rules.vocabulary = 'no-jargon';
  }
  
  // Extract sentence style
  if (profile.includes('short') && profile.includes('sentence')) {
    rules.sentenceStyle = 'short';
  } else if (profile.includes('concise') || profile.includes('brief')) {
    rules.sentenceStyle = 'concise';
  } else if (profile.includes('detailed') || profile.includes('comprehensive')) {
    rules.sentenceStyle = 'detailed';
  }
  
  // Extract specific examples from the profile
  lines.forEach(line => {
    if (line.includes('"') && line.includes('write like')) {
      const matches = line.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach(match => {
          rules.prefer.push(match.replace(/"/g, ''));
        });
      }
    }
    
    if (line.includes('"') && line.includes('don\'t write')) {
      const matches = line.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach(match => {
          rules.avoid.push(match.replace(/"/g, ''));
        });
      }
    }
  });
  
  return rules;
}

function applyBrandSpecificTransformations(text, characteristics, brandName) {
  let result = text;
  
  // Apply tone-specific transformations
  switch (characteristics.tone) {
    case 'direct':
      result = makeTextDirect(result);
      break;
    case 'friendly':
      result = makeTextFriendly(result);
      break;
    case 'professional':
      result = makeTextProfessional(result);
      break;
    case 'premium':
      result = makeTextPremium(result);
      break;
    case 'casual':
      result = makeTextCasual(result);
      break;
  }
  
  // Apply vocabulary transformations
  switch (characteristics.vocabulary) {
    case 'simple':
      result = simplifyVocabulary(result);
      break;
    case 'technical':
      result = addTechnicalLanguage(result);
      break;
    case 'no-jargon':
      result = removeJargon(result);
      break;
  }
  
  // Apply sentence style
  switch (characteristics.sentenceStyle) {
    case 'short':
      result = makeSentencesShort(result);
      break;
    case 'concise':
      result = makeConcise(result);
      break;
  }
  
  return result;
}

function makeTextDirect(text) {
  let result = text;
  result = result.replace(/we are excited to announce/gi, '');
  result = result.replace(/we are pleased to inform you/gi, '');
  result = result.replace(/it gives us great pleasure/gi, '');
  result = result.replace(/we would like to/gi, 'we\'ll');
  result = result.replace(/in order to/gi, 'to');
  result = result.replace(/for the purpose of/gi, 'to');
  result = result.replace(/might be able to/gi, 'can');
  result = result.replace(/we believe that/gi, '');
  return result;
}

function makeTextFriendly(text) {
  let result = text;
  result = result.replace(/Dear Sir\/Madam/gi, 'Hi there');
  result = result.replace(/we are writing to inform/gi, 'we wanted to let you know');
  result = result.replace(/do not hesitate to/gi, 'feel free to');
  result = result.replace(/we apologize for any inconvenience/gi, 'sorry for any hassle');
  result = result.replace(/sincerely/gi, 'thanks');
  result = result.replace(/kind regards/gi, 'cheers');
  return result;
}

function makeTextProfessional(text) {
  let result = text;
  result = result.replace(/hi there/gi, 'Dear');
  result = result.replace(/thanks/gi, 'Thank you');
  result = result.replace(/can\'t/gi, 'cannot');
  result = result.replace(/won\'t/gi, 'will not');
  result = result.replace(/we\'ll/gi, 'we will');
  return result;
}

function makeTextPremium(text) {
  let result = text;
  result = result.replace(/cheap/gi, 'value-focused');
  result = result.replace(/basic/gi, 'essential');
  result = result.replace(/standard/gi, 'classic');
  result = result.replace(/good/gi, 'excellent');
  result = result.replace(/nice/gi, 'exceptional');
  return result;
}

function makeTextCasual(text) {
  let result = text;
  result = result.replace(/cannot/gi, 'can\'t');
  result = result.replace(/will not/gi, 'won\'t');
  result = result.replace(/do not/gi, 'don\'t');
  result = result.replace(/we will/gi, 'we\'ll');
  result = result.replace(/you will/gi, 'you\'ll');
  return result;
}

function simplifyVocabulary(text) {
  let result = text;
  const simplifications = {
    'comprehensive': 'complete',
    'utilize': 'use',
    'facilitate': 'help',
    'innovative': 'new',
    'cutting-edge': 'modern',
    'revolutionary': 'new',
    'exceptional': 'great',
    'outstanding': 'great',
    'leverage': 'use',
    'implement': 'use',
    'optimize': 'improve',
    'enhance': 'improve',
    'accommodate': 'help',
    'demonstrate': 'show',
    'collaborate': 'work with',
    'communicate': 'talk'
  };
  
  Object.keys(simplifications).forEach(complex => {
    const regex = new RegExp(`\\b${complex}\\b`, 'gi');
    result = result.replace(regex, simplifications[complex]);
  });
  
  return result;
}

function removeJargon(text) {
  let result = text;
  const jargonRemovals = {
    'solutions': 'options',
    'paradigm': 'approach',
    'synergy': 'teamwork',
    'leverage': 'use',
    'robust': 'strong',
    'scalable': 'flexible',
    'seamless': 'smooth',
    'cutting-edge': 'modern',
    'state-of-the-art': 'modern',
    'best-in-class': 'top',
    'world-class': 'quality',
    'industry-leading': 'leading'
  };
  
  Object.keys(jargonRemovals).forEach(jargon => {
    const regex = new RegExp(`\\b${jargon}\\b`, 'gi');
    result = result.replace(regex, jargonRemovals[jargon]);
  });
  
  return result;
}

function makeSentencesShort(text) {
  // Split long sentences at conjunctions
  let result = text;
  result = result.replace(/,\s*and\s+/g, '. ');
  result = result.replace(/,\s*but\s+/g, '. However, ');
  result = result.replace(/;\s*/g, '. ');
  
  // Capitalize first letters after periods
  result = result.replace(/\.\s+([a-z])/g, (match, letter) => '. ' + letter.toUpperCase());
  
  return result;
}

function makeConcise(text) {
  let result = text;
  result = result.replace(/in order to/gi, 'to');
  result = result.replace(/for the purpose of/gi, 'to');
  result = result.replace(/due to the fact that/gi, 'because');
  result = result.replace(/in spite of the fact that/gi, 'although');
  result = result.replace(/at this point in time/gi, 'now');
  result = result.replace(/in the near future/gi, 'soon');
  result = result.replace(/a large number of/gi, 'many');
  result = result.replace(/a great deal of/gi, 'much');
  
  return result;
}

function applyProfileBasedTransformations(text, profile) {
  let result = text;
  
  // Apply transformations based on what's actually in the brand profile
  if (profile.includes('no fuss')) {
    result = result.replace(/comprehensive/gi, 'simple');
    result = result.replace(/complex/gi, 'simple');
  }
  
  if (profile.includes('action-oriented')) {
    result = result.replace(/will be able to/gi, 'can');
    result = result.replace(/would like to/gi, 'want to');
  }
  
  if (profile.includes('immediate')) {
    result = result.replace(/as soon as possible/gi, 'now');
    result = result.replace(/at your earliest convenience/gi, 'quickly');
  }
  
  return result;
}

// Main rewrite function
async function rewriteText(text, brandProfile, brandName) {
  // Try multiple LLM APIs in order of preference
  const apis = [
    { name: 'Groq', fn: rewriteWithGroq },
    { name: 'Together', fn: rewriteWithTogether },
    { name: 'HuggingFace', fn: rewriteWithHuggingFace }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API...`);
      const result = await api.fn(text, brandProfile, brandName);
      if (result && result.length > 10) {
        console.log(`Success with ${api.name} API`);
        return result;
      }
    } catch (error) {
      console.log(`${api.name} API failed:`, error.message);
      continue;
    }
  }
  
  // If all APIs fail, use local processing
  console.log('All APIs failed, using local processing');
  return localLLMRewrite(text, brandProfile, brandName);
}

// Rewrite endpoint
app.post('/api/rewrite', async (req, res) => {
  const { text, brandName } = req.body;
  
  if (!text || !brandName) {
    return res.status(400).json({ error: 'Text and brand name are required' });
  }
  
  if (!brandProfiles[brandName]) {
    return res.status(404).json({ error: `Brand profile '${brandName}' not found` });
  }
  
  try {
    const brandProfile = brandProfiles[brandName];
    const rewrittenText = await rewriteText(text, brandProfile, brandName);
    
    res.json({ 
      originalText: text,
      rewrittenText: rewrittenText,
      brandName: brandName
    });
  } catch (error) {
    console.error('Rewrite error:', error);
    res.status(500).json({ error: 'Failed to rewrite text: ' + error.message });
  }
});

// Initialize and start server
loadBrandProfiles();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Loaded ${Object.keys(brandProfiles).length} brand profiles`);
  console.log('Available brands:', Object.keys(brandProfiles).join(', '));
});