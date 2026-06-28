def word_count(text):
    # BUG: counts raw tokens. Casing differences and trailing punctuation
    # create spurious separate entries.
    counts = {}
    for w in text.split():
        counts[w] = counts.get(w, 0) + 1
    return counts
