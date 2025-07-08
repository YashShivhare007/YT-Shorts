// FIXED VERSION - Expand Context Node
// --- Configuration ---
const PRE_CONTEXT_SEGMENTS = 4;
const POST_CONTEXT_SEGMENTS = 4;

// --- Enhanced Helper Functions ---
function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  
  // Handle different input types
  if (typeof timeStr === 'number') return timeStr;
  if (typeof timeStr !== 'string') return 0;
  
  // Clean the string
  timeStr = timeStr.trim();
  
  // Handle MM:SS or HH:MM:SS format
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1]; // MM:SS
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  
  // Handle decimal seconds format
  const floatVal = parseFloat(timeStr);
  if (!isNaN(floatVal)) return floatVal;
  
  console.warn(`⚠️ Could not parse time: "${timeStr}"`);
  return 0;
}

function parseTransText(transText) {
  if (!transText) return [];
  const lines = transText.split('\n');
  const segments = [];

  for (const line of lines) {
    const match = line.match(/^(\d+:\d+|\d+\.\d+)\s*-\s*(\d+:\d+|\d+\.\d+|END):\s*(.*)$/);
    if (match) {
      const start = timeToSeconds(match[1]);
      const text = match[3].trim();
      segments.push({ start, text });
    }
  }
  return segments;
}

// Enhanced findBestMatch function
function findBestSegmentMatch(targetTime, segments, tolerance = 5.0) {
  let bestMatch = -1;
  let smallestDiff = Infinity;
  
  for (let i = 0; i < segments.length; i++) {
    const diff = Math.abs(segments[i].start - targetTime);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestMatch = i;
    }
  }
  
  // Return match only if within tolerance
  if (smallestDiff <= tolerance) {
    return bestMatch;
  }
  
  return -1;
}

// --- Main Logic ---
const inputData = $input.all();
const aiClipData = inputData.find(item => item.json.output)?.json;
const fullTranscriptData = inputData.find(item => item.json.TransText)?.json;
const VideoId = fullTranscriptData?.VideoId || inputData.find(item => item.json.VideoId)?.json?.VideoId;

if (!aiClipData || !fullTranscriptData) {
  throw new Error("Could not find AI clips or full transcript in the input data.");
}

const aiClips = aiClipData.output;
const fullTranscript = parseTransText(fullTranscriptData.TransText);

console.log(`📊 Processing ${aiClips.length} AI clips against ${fullTranscript.length} transcript segments`);

const clipsToReview = [];
const skippedClips = [];

for (let i = 0; i < aiClips.length; i++) {
  const clip = aiClips[i];
  
  try {
    const clipStartSeconds = timeToSeconds(clip.start);
    const clipEndSeconds = timeToSeconds(clip.end);
    
    console.log(`🎬 Processing clip ${i+1}: ${clipStartSeconds}s - ${clipEndSeconds}s`);

    // Use enhanced matching with tolerance
    const startIndex = findBestSegmentMatch(clipStartSeconds, fullTranscript);
    
    if (startIndex === -1) {
      console.warn(`⚠️ CLIP SKIPPED: Could not find start segment for clip ${i+1} at ${clipStartSeconds}s`);
      skippedClips.push({
        clipIndex: i,
        reason: `No transcript segment found near ${clipStartSeconds}s`,
        originalClip: clip
      });
      continue;
    }

    // Find end segment with enhanced matching
    let endIndex = findBestSegmentMatch(clipEndSeconds, fullTranscript);
    if (endIndex === -1) {
      // If no exact match, find the last segment before the end time
      endIndex = fullTranscript.length - 1;
      for (let j = fullTranscript.length - 1; j >= 0; j--) {
        if (fullTranscript[j].start <= clipEndSeconds) {
          endIndex = j;
          break;
        }
      }
    }

    // Ensure end is after start
    if (endIndex < startIndex) {
      endIndex = Math.min(startIndex + 2, fullTranscript.length - 1);
    }

    // Context window
    const expandedStartIndex = Math.max(0, startIndex - PRE_CONTEXT_SEGMENTS);
    const expandedEndIndex = Math.min(fullTranscript.length - 1, endIndex + POST_CONTEXT_SEGMENTS);

    const expandedSegments = fullTranscript.slice(expandedStartIndex, expandedEndIndex + 1);

    clipsToReview.push({
      original_reason: clip.reason,
      original_category: clip.category,
      confidence: clip.confidence,
      clipIndex: i, // Add for tracking
      segments_for_editing: expandedSegments.map(seg => ({
        start: seg.start,
        text: seg.text
      })),
      expanded_transcript_text: expandedSegments
        .map(seg => `[${seg.start.toFixed(2)}] ${seg.text}`)
        .join('\n')
    });
    
    console.log(`✅ Clip ${i+1} processed successfully`);
    
  } catch (error) {
    console.error(`❌ Error processing clip ${i+1}:`, error);
    skippedClips.push({
      clipIndex: i,
      reason: `Processing error: ${error.message}`,
      originalClip: clip
    });
  }
}

// Log summary
console.log(`📊 SUMMARY: ${clipsToReview.length} clips processed, ${skippedClips.length} clips skipped`);
if (skippedClips.length > 0) {
  console.warn(`⚠️ SKIPPED CLIPS:`, skippedClips);
}

// Return result with metadata
return [
  {
    json: {
      VideoId: VideoId,
      clips_for_ai_editor: clipsToReview,
      processing_summary: {
        total_input_clips: aiClips.length,
        processed_clips: clipsToReview.length,
        skipped_clips: skippedClips.length,
        skipped_details: skippedClips
      }
    }
  }
]; 