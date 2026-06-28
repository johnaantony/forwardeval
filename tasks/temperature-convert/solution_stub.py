def convert(value, from_unit, to_unit):
    # Only Celsius <-> Fahrenheit is implemented. Kelvin is missing,
    # and same-unit conversion is not handled.
    if from_unit == "C" and to_unit == "F":
        return round(value * 9 / 5 + 32, 2)
    if from_unit == "F" and to_unit == "C":
        return round((value - 32) * 5 / 9, 2)
    return None
