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
  // Reload brands each time to pick up new files
  loadBrandProfiles();
  
  const brands = Object.keys(brandProfiles).map(name => ({
    name,
    preview: brandProfiles[name].substring(0, 200) + '...'
  }));
  
  res.json(brands);
});

// Rewrite text in brand voice
app.post('/api/rewrite', (req, res) => {
  const { text, brandName } = req.body;
  
  if (!text || !brandName) {
    return res.status(400).json({ error: 'Text and brand name are required' });
  }
  
  if (!brandProfiles[brandName]) {
    return res.status(404).json({ error: `Brand profile '${brandName}' not found` });
  }
  
  const brandProfile = brandProfiles[brandName];
  const rewrittenText = simulateRewrite(text, brandProfile, brandName);
  
  res.json({ 
    originalText: text,
    rewrittenText: rewrittenText,
    brandName: brandName
  });
});

// Simulate AI rewriting (replace with actual AI integration)
function simulateRewrite(text, brandProfile, brandName) {
  const characteristics = extractBrandCharacteristics(brandProfile);
  
  return `[Rewritten in ${brandName} voice]

Original: "${text}"

Rewritten: "${applyBrandVoice(text, brandProfile, brandName)}" 

--- Brand Voice Applied ---
${characteristics}

Note: This is a simulation. In production, integrate with OpenAI, Claude, or another AI service to perform actual text rewriting based on the brand profile.`;
}

// Simple brand voice application (replace with AI)
function applyBrandVoice(text, brandProfile, brandName) {
  // This is a very basic simulation - in real implementation, use AI
  const lowerProfile = brandProfile.toLowerCase();
  
  if (lowerProfile.includes('direct') || lowerProfile.includes('straightforward')) {
    return text + " (Direct and clear approach applied)";
  } else if (lowerProfile.includes('friendly') || lowerProfile.includes('casual')) {
    return text + " (Friendly tone applied)";
  } else if (lowerProfile.includes('professional') || lowerProfile.includes('formal')) {
    return text + " (Professional tone applied)";
  } else {
    return text + ` (${brandName} brand voice applied)`;
  }
}

function extractBrandCharacteristics(profile) {
  const lines = profile.split('\n');
  const characteristics = [];
  
  lines.forEach(line => {
    if (line.includes('•') || line.includes('-') || line.includes('*')) {
      characteristics.push(line.trim());
    } else if (line.includes(':') && (line.includes('Positioning') || line.includes('Voice') || line.includes('Tone'))) {
      characteristics.push(line.trim());
    }
  });
  
  return characteristics.slice(0, 5).join('\n') || 'Brand characteristics applied from profile';
}

// Initialize and start server
loadBrandProfiles();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Loaded ${Object.keys(brandProfiles).length} brand profiles`);
  console.log('Available brands:', Object.keys(brandProfiles).join(', '));
});