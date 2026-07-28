import re


def slugify(title):
    lowered = title.lower()
    # Runs of whitespace, underscores, and hyphens are a single separator.
    separated = re.sub(r"[\s_\-]+", "-", lowered)
    # Drop everything that is not alphanumeric or a hyphen.
    cleaned = re.sub(r"[^a-z0-9\-]", "", separated)
    # Collapse hyphen runs created by dropped characters, then trim.
    collapsed = re.sub(r"-+", "-", cleaned).strip("-")
    return collapsed if collapsed else "untitled"
