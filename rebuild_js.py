with open('static/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()
with open('static/app_tambahan.js', 'r', encoding='utf-8') as f:
    tambahan = f.read()

# Find where tambahan starts - look for the closing brace before the tambahan comment
# The pattern is: }// followed by box-drawing or ASCII dashes then TAMBAHAN
import re
m = re.search(r'\}(?=\s*//[^\n]*TAMBAHAN)', app_js)
if m:
    base = app_js[:m.end()]
    new_js = base + "\n" + tambahan
    with open('static/app.js', 'w', encoding='utf-8') as f:
        f.write(new_js)
    print("app.js rebuilt, lines:", new_js.count("\n"))
else:
    # Fallback: find last occurrence of the pattern manually
    lines = app_js.split("\n")
    cut = None
    for i, line in enumerate(lines):
        if "TAMBAHAN" in line and "//" in line:
            cut = i
            break
    if cut and cut > 0:
        base = "\n".join(lines[:cut])
        # find last } before this line
        last_brace = base.rfind("}")
        base = base[:last_brace+1]
        new_js = base + "\n" + tambahan
        with open('static/app.js', 'w', encoding='utf-8') as f:
            f.write(new_js)
        print("app.js rebuilt (fallback), lines:", new_js.count("\n"))
    else:
        print("ERROR: could not find tambahan marker")
        print("Searching for TAMBAHAN in first 50 lines...")
        for i, line in enumerate(lines[:50]):
            if "TAMBAHAN" in line:
                print(f"  Line {i}: {repr(line[:80])}")
