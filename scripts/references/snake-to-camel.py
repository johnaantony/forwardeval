def to_camel(s):
    parts = [p for p in s.split("_") if p]
    if not parts:
        return ""
    first = parts[0]
    rest = [p[:1].upper() + p[1:] for p in parts[1:]]
    return first + "".join(rest)
