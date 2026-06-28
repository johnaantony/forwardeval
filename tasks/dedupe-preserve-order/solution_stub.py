def dedupe(items):
    # BUG: using a set drops duplicates but does not preserve order.
    return list(set(items))
