def word_count(text):
    counts = {}
    strip_chars = ".,!?;:\"'()[]{}"
    for token in text.split():
        w = token.strip(strip_chars).lower()
        if not w:
            continue
        counts[w] = counts.get(w, 0) + 1
    return counts
