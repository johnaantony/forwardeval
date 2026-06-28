def int_to_roman(n):
    # BUG: only additive numerals, so 4 -> "IIII", 9 -> "VIIII", etc.
    vals = [(1000, "M"), (500, "D"), (100, "C"), (50, "L"), (10, "X"), (5, "V"), (1, "I")]
    res = []
    for v, sym in vals:
        while n >= v:
            res.append(sym)
            n -= v
    return "".join(res)
