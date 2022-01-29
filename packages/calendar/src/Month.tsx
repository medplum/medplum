import React from 'react';
import './Month.css';

export interface MonthProps {
  year: number;
  month: number;
  onClick: (day: string) => void;
}

export function Month(props: MonthProps): JSX.Element {
  const grid: string[][] = [];
  let row: string[] = [];
  let d = new Date(props.year, props.month);

  // Fill leading empty days
  for (let i = 0; i < d.getDay(); i++) {
    row.push('');
  }

  while (d.getMonth() === props.month) {
    row.push(d.getDate().toString());

    if (d.getDay() === 6) {
      grid.push(row);
      row = [];
    }

    d.setDate(d.getDate() + 1);
  }

  // Fill trailing empty days
  if (d.getDay() !== 0) {
    for (let i = d.getDay(); i < 7; i++) {
      row.push('');
    }
  }

  grid.push(row);

  return (
    <table className="medplum-calendar-table">
      <thead>
        <tr>
          <th>SUN</th>
          <th>MON</th>
          <th>TUE</th>
          <th>WED</th>
          <th>THU</th>
          <th>FRI</th>
          <th>SAT</th>
        </tr>
      </thead>
      <tbody>
        {grid.map((week, weekIndex) => (
          <tr key={'week-' + weekIndex}>
            {week.map((day, dayIndex) => (
              <td key={'day-' + dayIndex}>
                <button
                  disabled={day === '' || dayIndex === 0 || dayIndex === 6}
                  onClick={() => props.onClick(`${props.year}-${props.month}-${day}`)}
                >
                  {day}
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
