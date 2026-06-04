from pathlib import Path

path = Path(r'C:\Users\TPC-USER\Desktop\AUTO-QA-TPC\docs\SIMPLIFIED_SYSTEM_FLOW.md')
text = path.read_text(encoding='utf-8')
needle = '## What is Already Implemented'
insert = (
    '## Live detection requirement\n'
    'The intended system behavior is that defects should be visible immediately when the IC or batch appears in the camera view, '
    'with segmentation or bounding boxes overlaid in real time. This should work before the admin/operator explicitly starts a batch session, '
    'making the first visible batch immediately diagnosable.\n\n'
)
if needle not in text:
    raise SystemExit('Needle not found in the document.')
text = text.replace(needle, insert + needle)
path.write_text(text, encoding='utf-8')
print('updated')
