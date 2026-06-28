def convert(value, from_unit, to_unit):
    # normalize to Celsius first
    if from_unit == "C":
        c = value
    elif from_unit == "F":
        c = (value - 32) * 5 / 9
    elif from_unit == "K":
        c = value - 273.15
    else:
        raise ValueError("unknown unit")

    if to_unit == "C":
        out = c
    elif to_unit == "F":
        out = c * 9 / 5 + 32
    elif to_unit == "K":
        out = c + 273.15
    else:
        raise ValueError("unknown unit")

    return round(out, 2)
