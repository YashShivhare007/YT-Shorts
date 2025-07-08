# Fix syntax error in backend_processor.py
with open('backend_processor.py', 'r') as f:
    content = f.read()

# Fix the specific syntax error
content = content.replace(
    '''        if args.mode == 'youtube':
            if not args.clips_json:
                raise ValueError("clips_json required for YouTube mode")
        clips_data = json.loads(args.clips_json)
            result = processor.process_video_youtube(args.url, args.VideoId, clips_data)''',
    '''        if args.mode == 'youtube':
            if not args.clips_json:
                raise ValueError("clips_json required for YouTube mode")
            clips_data = json.loads(args.clips_json)
            result = processor.process_video_youtube(args.url, args.VideoId, clips_data)'''
)

with open('backend_processor.py', 'w') as f:
    f.write(content)

print("✅ Syntax error fixed!") 