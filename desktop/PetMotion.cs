using System;
using System.Collections.Generic;
using System.Drawing;

namespace PuppyRubyDesktop
{
    // Pure motion: no input hooks, timers, settings, game state, or network calls.
    // Coordinates are desktop pixels and dt is elapsed seconds. The caller owns
    // whether follow is enabled while dragging, hidden, or showing another UI.
    internal sealed class PetMotion
    {
        internal const double MaximumSpeed = 220.0;
        internal const double Acceleration = 700.0;
        internal const double MaximumStepSeconds = 0.05;
        internal const double CursorGap = 50.0;
        internal const double ArrivalRadius = 4.0;
        internal const double ResumeRadius = 9.0;

        private double x, y, velocityX, velocityY;
        private int preferredSide;
        private bool arrived;
        internal bool IsMoving { get; private set; }
        internal int DirectionX { get; private set; }
        internal Point PositionPoint { get { return new Point(Round(x), Round(y)); } }

        internal void SetPosition(Point position)
        {
            x = position.X; y = position.Y;
            preferredSide = 0; arrived = false; Stop();
        }

        internal Point Step(Point cursor, Size windowSize, Rectangle[] workingAreas, double dt, bool following)
        {
            Size size = new Size(Math.Max(1, windowSize.Width), Math.Max(1, windowSize.Height));
            Rectangle[] areas = ValidAreas(workingAreas);
            if (areas.Length == 0) { Stop(); return PositionPoint; }

            // A resized pet or removed monitor must not strand a stopped pet.
            if (!FitsUnion(PositionPoint, size, areas))
            {
                Point placed = NearestPlacement(x, y, size, areas);
                x = placed.X; y = placed.Y; arrived = false; Stop();
            }
            if (!following || Double.IsNaN(dt) || dt <= 0)
            {
                arrived = false; Stop(); return PositionPoint;
            }
            dt = Math.Min(MaximumStepSeconds, dt);

            Point current = PositionPoint;
            if (new Rectangle(current, size).Contains(cursor))
            {
                // Hovering over the puppy is petting, not a target to chase.
                arrived = false; Stop(); return current;
            }

            Rectangle targetArea = CursorArea(cursor, areas);
            Point target = FollowTarget(cursor, size, targetArea);
            double dx = target.X - x, dy = target.Y - y;
            double distance = Math.Sqrt(dx * dx + dy * dy);
            if (distance <= ArrivalRadius || (arrived && distance <= ResumeRadius))
            {
                // Do not snap to each slightly changing cursor target: that would
                // turn one-pixel mouse noise into a visibly shaking puppy.
                arrived = true; Stop(); return PositionPoint;
            }
            arrived = false;

            double speed = Math.Min(MaximumSpeed, Math.Sqrt(2 * Acceleration * Math.Max(0, distance - ArrivalRadius)));
            double desiredX = dx / distance * speed, desiredY = dy / distance * speed;
            double changeX = desiredX - velocityX, changeY = desiredY - velocityY;
            double changeLength = Math.Sqrt(changeX * changeX + changeY * changeY);
            double maximumChange = Acceleration * dt;
            if (changeLength > maximumChange)
            {
                changeX *= maximumChange / changeLength; changeY *= maximumChange / changeLength;
            }
            velocityX += changeX; velocityY += changeY;
            double stepX = velocityX * dt, stepY = velocityY * dt;
            double nextX = x + stepX, nextY = y + stepY;

            // With a suddenly nearer target, stop at it rather than overshoot.
            if (stepX * dx + stepY * dy > 0 && stepX * stepX + stepY * stepY >= distance * distance)
            {
                nextX = target.X; nextY = target.Y;
                arrived = true; Stop();
            }

            Point next = new Point(Round(nextX), Round(nextY));
            if (!FitsUnion(next, size, areas))
            {
                Point correction = NearestPlacement(nextX, nextY, size, areas);
                Rectangle currentArea = CursorArea(new Point(current.X + size.Width / 2, current.Y + size.Height / 2), areas);
                if (currentArea != targetArea && !FitsInArea(current, size, targetArea))
                {
                    // Non-touching monitors have an undisplayable gap. Skip that
                    // gap once to the destination edge; never get stuck pressing
                    // against the source edge. Adjacent monitor unions need no jump.
                    correction = ClampPlacement(nextX, nextY, size, targetArea);
                }
                x = correction.X; y = correction.Y;
                if (x != nextX) velocityX = 0;
                if (y != nextY) velocityY = 0;
            }
            else { x = nextX; y = nextY; }

            IsMoving = Math.Abs(velocityX) + Math.Abs(velocityY) > 0.01;
            DirectionX = IsMoving && Math.Abs(velocityX) > 0.5 ? (velocityX < 0 ? -1 : 1) : 0;
            return PositionPoint;
        }

        private void Stop() { velocityX = velocityY = 0; IsMoving = false; DirectionX = 0; }

        private Point FollowTarget(Point cursor, Size size, Rectangle area)
        {
            double centerX = x + size.Width / 2.0;
            if (preferredSide == 0) preferredSide = centerX < cursor.X ? -1 : 1;
            else if (preferredSide < 0 && cursor.X < centerX - size.Width / 2.0 - CursorGap) preferredSide = 1;
            else if (preferredSide > 0 && cursor.X > centerX + size.Width / 2.0 + CursorGap) preferredSide = -1;

            int verticalSide = y + size.Height / 2.0 < cursor.Y ? -1 : 1;
            var candidates = new Point[4];
            candidates[0] = ClampPlacement(cursor.X + preferredSide * (size.Width / 2.0 + CursorGap) - size.Width / 2.0, cursor.Y - size.Height / 2.0, size, area);
            candidates[1] = ClampPlacement(cursor.X - preferredSide * (size.Width / 2.0 + CursorGap) - size.Width / 2.0, cursor.Y - size.Height / 2.0, size, area);
            candidates[2] = ClampPlacement(cursor.X - size.Width / 2.0, cursor.Y + verticalSide * (size.Height / 2.0 + CursorGap) - size.Height / 2.0, size, area);
            candidates[3] = ClampPlacement(cursor.X - size.Width / 2.0, cursor.Y - verticalSide * (size.Height / 2.0 + CursorGap) - size.Height / 2.0, size, area);
            int best = 0; double bestGap = -1;
            for (int i = 0; i < candidates.Length; i++)
            {
                double clearance = DistanceToRectangle(cursor.X, cursor.Y, new Rectangle(candidates[i], size));
                if (clearance >= CursorGap - 0.5)
                {
                    if (i == 1) preferredSide = -preferredSide;
                    return candidates[i];
                }
                if (clearance > bestGap) { best = i; bestGap = clearance; }
            }
            // On a screen smaller than the pet plus its gap, full clearance can
            // be impossible. Keep the pet visible and choose the most clearance.
            return candidates[best];
        }

        private static Rectangle[] ValidAreas(Rectangle[] source)
        {
            if (source == null) return new Rectangle[0];
            var result = new List<Rectangle>();
            foreach (Rectangle area in source) if (area.Width > 0 && area.Height > 0) result.Add(area);
            return result.ToArray();
        }
        private static Rectangle CursorArea(Point point, Rectangle[] areas)
        {
            Rectangle result = areas[0]; double distance = Double.MaxValue;
            foreach (Rectangle area in areas)
            {
                if (area.Contains(point)) return area;
                double candidate = DistanceToRectangle(point.X, point.Y, area);
                if (candidate < distance) { distance = candidate; result = area; }
            }
            return result;
        }
        private static double DistanceToRectangle(double px, double py, Rectangle rectangle)
        {
            double dx = Math.Max(rectangle.Left - px, Math.Max(0, px - (rectangle.X + (double)rectangle.Width)));
            double dy = Math.Max(rectangle.Top - py, Math.Max(0, py - (rectangle.Y + (double)rectangle.Height)));
            return Math.Sqrt(dx * dx + dy * dy);
        }
        private static Point ClampPlacement(double px, double py, Size size, Rectangle area)
        {
            double right = Math.Max(area.Left, area.X + (double)area.Width - size.Width);
            double bottom = Math.Max(area.Top, area.Y + (double)area.Height - size.Height);
            return new Point(Round(Math.Max(area.Left, Math.Min(px, right))), Round(Math.Max(area.Top, Math.Min(py, bottom))));
        }
        private static Point NearestPlacement(double px, double py, Size size, Rectangle[] areas)
        {
            Point best = ClampPlacement(px, py, size, areas[0]); double distance = Double.MaxValue;
            foreach (Rectangle area in areas)
            {
                Point candidate = ClampPlacement(px, py, size, area);
                double dx = candidate.X - px, dy = candidate.Y - py;
                double amount = dx * dx + dy * dy;
                if (amount < distance) { distance = amount; best = candidate; }
            }
            return best;
        }
        private static bool FitsInArea(Point position, Size size, Rectangle area)
        {
            return position.X >= area.Left && position.Y >= area.Top && position.X + (double)size.Width <= area.X + (double)area.Width && position.Y + (double)size.Height <= area.Y + (double)area.Height;
        }
        private static bool FitsUnion(Point position, Size size, Rectangle[] areas)
        {
            foreach (Rectangle area in areas) if (FitsInArea(position, size, area)) return true;
            double left = position.X, right = position.X + (double)size.Width;
            double top = position.Y, bottom = position.Y + (double)size.Height;
            var splits = new List<double> { left, right };
            foreach (Rectangle area in areas)
            {
                if (area.Left > left && area.Left < right) splits.Add(area.Left);
                double edge = area.X + (double)area.Width;
                if (edge > left && edge < right) splits.Add(edge);
            }
            splits.Sort();
            for (int i = 1; i < splits.Count; i++)
            {
                if (splits[i] == splits[i - 1]) continue;
                double middle = (splits[i] + splits[i - 1]) / 2;
                double covered = top;
                bool advanced;
                do
                {
                    advanced = false;
                    foreach (Rectangle area in areas)
                    {
                        double areaBottom = area.Y + (double)area.Height;
                        if (area.Left <= middle && area.X + (double)area.Width >= middle && area.Top <= covered && areaBottom > covered)
                        { covered = areaBottom; advanced = true; }
                    }
                } while (advanced && covered < bottom);
                if (covered < bottom) return false;
            }
            return true;
        }
        private static int Round(double value)
        {
            return (int)Math.Max(Int32.MinValue, Math.Min(Int32.MaxValue, Math.Round(value, MidpointRounding.AwayFromZero)));
        }
    }
}
