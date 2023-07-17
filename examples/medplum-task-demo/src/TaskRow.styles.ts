import { createStyles, keyframes } from '@mantine/core';

export const useStyles = createStyles(
  (theme) =>
    ({
      task: {
        backgroundColor: theme.white,
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: theme.colors.gray[0],
        },
        '& td': {
          whiteSpace: 'nowrap',
        },
      },

      ...Object.fromEntries(
        ['gray', 'blue', 'green', 'yellow', 'orange', 'red'].map((c) => [
          c,
          {
            color: theme.colors[c][8],
            backgroundColor: theme.colors[c][0],
            '&:hover': {
              backgroundColor: theme.colors[c][1],
            },
          },
        ])
      ),

      blinking: {
        color: theme.colors.red[8],
        backgroundColor: theme.colors.red[0],
        fontWeight: 700,
        '&:hover': {
          backgroundColor: theme.colors.red[2],
        },
        '& td:not(:last-child)': {
          animation: `${keyframes({ '50%': { opacity: 0 } })} 1s linear infinite`,
        },
      },

      actions: {
        textAlign: 'right',
      },
    } as Record<string, any>)
);
