// FIXED VERSION - Prepare Final Drive Links Node
const items = $input.all();

// More robust data extraction
let resultData = null;
let VideoId = null;
let clips = [];

// Try multiple ways to extract the result data
if (items[0]?.json?.result) {
  resultData = items[0].json.result;
} else if (items[0]?.json) {
  resultData = items[0].json;
}

if (resultData) {
  VideoId = resultData.VideoId;
  clips = resultData.results || resultData.clips || [];
}

console.log(`📊 Processing drive links for ${clips.length} clips from VideoId: ${VideoId}`);

const finalRows = [];
const missingLinks = [];

for (let i = 0; i < clips.length; i++) {
  const clip = clips[i];
  const clipIndex = clip.clip_number ? clip.clip_number - 1 : i;
  const clipId = `${VideoId}-${clipIndex}`;
  
  try {
    if (clip.status === 'success' && clip.drive_link) {
      finalRows.push({
        json: {
          "Clip ID": clipId,
          "Drive Link": clip.drive_link
        }
      });
      console.log(`✅ Drive link added for clip ${clipId}`);
    } else {
      // Handle failed clips
      missingLinks.push({
        clipId: clipId,
        status: clip.status || 'unknown',
        reason: clip.error || 'No drive link available'
      });
      
      // Still add a row but with error indicator
      finalRows.push({
        json: {
          "Clip ID": clipId,
          "Drive Link": `ERROR: ${clip.status || 'Failed'} - ${clip.error || 'No link generated'}`
        }
      });
      console.warn(`⚠️ Missing drive link for clip ${clipId}: ${clip.status}`);
    }
  } catch (error) {
    console.error(`❌ Error processing clip ${i}:`, error);
    finalRows.push({
      json: {
        "Clip ID": clipId,
        "Drive Link": `ERROR: Processing failed - ${error.message}`
      }
    });
  }
}

// Log summary
console.log(`📊 DRIVE LINKS SUMMARY: ${finalRows.length} total rows, ${missingLinks.length} missing/failed links`);
if (missingLinks.length > 0) {
  console.warn(`⚠️ MISSING LINKS:`, missingLinks);
}

return finalRows; 