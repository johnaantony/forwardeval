def to_camel(s):
    # Naive split. Mishandles leading/trailing/repeated underscores, and
    # capitalize() destroys the casing of the rest of each segment.
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])
