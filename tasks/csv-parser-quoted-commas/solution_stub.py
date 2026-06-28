def parse_csv(line):
    # BUG: splits on every comma, ignoring quoted fields, and never strips
    # the surrounding double quotes.
    return line.split(",")
