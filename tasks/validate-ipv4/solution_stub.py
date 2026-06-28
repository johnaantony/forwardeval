def is_valid_ipv4(s):
    parts = s.split(".")
    if len(parts) != 4:
        return False
    for p in parts:
        if not p.isdigit():
            return False
        # BUG: accepts leading zeros like "01" or "00"
        if int(p) > 255:
            return False
    return True
