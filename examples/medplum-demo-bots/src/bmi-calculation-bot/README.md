# BMI Calculation Bot

This bot processes a Patient resource and automatically calculates BMI (Body Mass Index) from the latest height and weight observations.

## Overview

The bot performs the following operations:

1. **Searches for observations**:
   - Latest height observation (LOINC: 8302-2)
   - Latest weight observation (LOINC: 29463-7)

2. **Calculates BMI**:
   - Extracts values from the latest height and weight observations
   - Handles unit conversions automatically
   - Calculates BMI using the formula: `BMI = weight (kg) / (height (m))²`

3. **Creates BMI Observation**:
   - Creates a new BMI observation (LOINC: 39156-5) each time the bot runs
   - Stores the calculated BMI value in kg/m²
   - Allows tracking BMI changes over time

## Unit Conversions

The bot automatically handles unit conversions for both height and weight:

### Height Conversions:
- **Centimeters (cm)** → Meters (m): divides by 100
- **Inches (in)** → Meters (m): multiplies by 0.0254
- **Meters (m)** → No conversion needed

### Weight Conversions:
- **Grams (g)** → Kilograms (kg): divides by 1000
- **Pounds (lb)** → Kilograms (kg): multiplies by 0.453592
- **Ounces (oz)** → Kilograms (kg): multiplies by 0.0283495
- **Kilograms (kg)** → No conversion needed

## Setup

1. Create a Bot resource and paste the bot code from `bmi-calculation-bot.ts`
2. Configure the bot subscription to trigger on `Patient` resource creation or update
3. Ensure the bot has appropriate access permissions for:
   - Reading `Patient` resources
   - Searching `Observation` resources
   - Creating/updating `Observation` resources

## Usage

1. Ensure the patient has at least one height observation and one weight observation
2. When the patient resource is created or updated, the bot will:
   - Find the latest height and weight observations
   - Calculate BMI from those values
   - Create a new BMI observation (preserves historical BMI values)

## Behavior

- **If height or weight observation is missing**: The bot logs a message and exits without creating a BMI observation
- **If observation values are missing**: The bot logs a message and exits
- **If BMI calculation succeeds**: The bot creates a new BMI observation with the calculated value (allows tracking BMI over time)

## Example

Given a patient with:
- Latest height observation: 70 inches (converted to 1.778 meters)
- Latest weight observation: 180 pounds (converted to 81.647 kg)

The bot will calculate:
```
BMI = 81.647 kg / (1.778 m)² = 25.85 kg/m²
```

And create an Observation with:
- Code: LOINC 39156-5 (Body mass index)
- Value: 25.85 kg/m²
- Status: final
- Category: vital-signs

## Notes

- The bot uses the **latest** observation of each type (sorted by date)
- BMI observations are **created** (not upserted), allowing you to track BMI changes over time
- Each time the bot runs, it creates a new BMI observation based on the latest height and weight
- The bot handles common unit variations but may log warnings for unrecognized units

