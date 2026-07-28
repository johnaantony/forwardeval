def slugify(title):
    # Naive first pass from the session: lowercase and swap spaces for hyphens.
    # Punctuation leaks through, separators don't collapse, and empty titles
    # produce empty slugs instead of the "untitled" fallback.
    return title.lower().replace(" ", "-")
