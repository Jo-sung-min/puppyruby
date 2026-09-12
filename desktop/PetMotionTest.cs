using System;
using System.Drawing;

namespace PuppyRubyDesktop
{
    internal static class PetMotionTest
    {
        internal static void Run(Action<bool, string> check)
        {
            var normal = new[] { new Rectangle(0, 0, 1600, 1000) };
            Size size = new Size(160, 160);
            var motion = new PetMotion();
            motion.SetPosition(new Point(100, 100));
            check(motion.PositionPoint == new Point(100, 100) && !motion.IsMoving && motion.DirectionX == 0, "motion manual position starts stationary");
            Point before = motion.PositionPoint;
            Point first = motion.Step(new Point(1200, 500), size, normal, .04, true);
            check(Distance(before, first) <= 2 && motion.IsMoving && motion.DirectionX == 1, "motion accelerates smoothly toward cursor");
            bool boundedSpeed = true;
            for (int i = 0; i < 80; i++)
            {
                before = motion.PositionPoint;
                Point next = motion.Step(new Point(1200, 500), size, normal, .04, true);
                if (Distance(before, next) > PetMotion.MaximumSpeed * .04 + 1.5) boundedSpeed = false;
            }
            check(boundedSpeed, "motion respects 220 pixel per second speed cap");
            before = motion.PositionPoint;
            Point stopped = motion.Step(new Point(1400, 850), size, normal, .04, false);
            check(stopped == before && !motion.IsMoving && motion.DirectionX == 0, "motion stop immediately clears velocity");
            for (int i = 0; i < 20; i++) motion.Step(new Point(1500 - i * 10, 800), size, normal, .04, false);
            check(motion.PositionPoint == stopped, "motion stays stopped while cursor keeps moving");

            motion.SetPosition(new Point(100, 100));
            for (int i = 0; i < 500; i++) motion.Step(new Point(700, 400), size, normal, .02, true);
            Point arrived = motion.PositionPoint;
            check(!motion.IsMoving && !new Rectangle(arrived, size).Contains(new Point(700, 400)) && DistanceFromRect(new Point(700, 400), new Rectangle(arrived, size)) >= 45, "motion arrives beside cursor with safe edge clearance");
            for (int i = 0; i < 100; i++) motion.Step(new Point(700 + i % 3 - 1, 400 + i % 3 - 1), size, normal, .02, true);
            check(motion.PositionPoint == arrived && !motion.IsMoving, "motion arrival hysteresis ignores tiny mouse jitter");
            motion.Step(new Point(arrived.X + 80, arrived.Y + 30), size, normal, .04, true);
            check(motion.PositionPoint == arrived && !motion.IsMoving, "motion pauses for mouse over puppy head");

            motion.SetPosition(new Point(1200, 100));
            motion.Step(new Point(300, 500), size, normal, .04, true);
            check(motion.DirectionX == -1, "motion reports leftward travel");
            motion.SetPosition(new Point(350, 270));
            before = motion.PositionPoint;
            motion.Step(new Point(1300, 800), size, normal, .04, true);
            check(Distance(before, motion.PositionPoint) <= 2, "motion manual drag reset discards old velocity");

            var slept = new PetMotion(); var ordinary = new PetMotion();
            slept.SetPosition(new Point(100, 100)); ordinary.SetPosition(new Point(100, 100));
            Point afterSleep = slept.Step(new Point(1300, 800), size, normal, 7200, true);
            Point afterCap = ordinary.Step(new Point(1300, 800), size, normal, PetMotion.MaximumStepSeconds, true);
            check(afterSleep == afterCap && Distance(new Point(100, 100), afterSleep) <= 3, "motion caps elapsed time after system sleep");
            before = slept.PositionPoint;
            slept.Step(new Point(1300, 800), size, normal, Double.NaN, true);
            check(slept.PositionPoint == before && !slept.IsMoving, "motion rejects invalid timestep without poisoning position");

            var negative = new[] { new Rectangle(-1600, -200, 1600, 1100) };
            motion.SetPosition(new Point(-600, 300));
            bool stayedVisible = true;
            for (int i = 0; i < 500; i++)
            {
                Point point = motion.Step(new Point(-1550, -150), new Size(224, 224), negative, .04, true);
                stayedVisible &= point.X >= -1600 && point.Y >= -200 && point.X + 224 <= 0 && point.Y + 224 <= 900;
            }
            check(stayedVisible && motion.PositionPoint.X < 0, "motion handles negative monitor coordinates and edge bounds");
            check(DistanceFromRect(new Point(-1550, -150), new Rectangle(motion.PositionPoint, new Size(224, 224))) >= 45, "motion chooses other side near screen corner");

            var narrow = new[] { new Rectangle(0, 0, 320, 900) };
            motion.SetPosition(new Point(0, 600));
            for (int i = 0; i < 600; i++) motion.Step(new Point(160, 300), new Size(224, 224), narrow, .04, true);
            check(DistanceFromRect(new Point(160, 300), new Rectangle(motion.PositionPoint, new Size(224, 224))) >= 45, "motion uses vertical clearance on narrow screen");

            var adjoining = new[] { new Rectangle(-1000, 0, 1000, 800), new Rectangle(0, 0, 1000, 800) };
            motion.SetPosition(new Point(-500, 300));
            bool smoothSeam = true, crossedSeam = false;
            for (int i = 0; i < 500; i++)
            {
                before = motion.PositionPoint;
                Point point = motion.Step(new Point(750, 300), size, adjoining, .04, true);
                smoothSeam &= Distance(before, point) <= PetMotion.MaximumSpeed * .04 + 1.5;
                crossedSeam |= point.X < 0 && point.X + size.Width > 0;
            }
            check(smoothSeam && crossedSeam && motion.PositionPoint.X > 0, "motion crosses adjacent monitor seam without teleport");

            var separated = new[] { new Rectangle(-1000, 0, 800, 800), new Rectangle(200, 0, 800, 800) };
            motion.SetPosition(new Point(-700, 300));
            for (int i = 0; i < 500; i++) motion.Step(new Point(700, 400), size, separated, .04, true);
            check(motion.PositionPoint.X >= 200 && motion.PositionPoint.X + size.Width <= 1000 && !motion.IsMoving, "motion traverses undisplayable monitor gap without getting stuck");

            motion.SetPosition(new Point(-800, -100));
            Point repaired = motion.Step(Point.Empty, size, normal, .04, false);
            check(repaired.X >= 0 && repaired.Y >= 0 && !motion.IsMoving, "motion restores visible bounds after monitor removal while stopped");
            motion.SetPosition(new Point(100, 100));
            Point noScreens = motion.Step(new Point(800, 800), size, new Rectangle[0], .04, true);
            check(noScreens == new Point(100, 100) && !motion.IsMoving, "motion safely pauses with no usable working areas");
            motion.Step(Point.Empty, new Size(2400, 1500), normal, .04, false);
            check(motion.PositionPoint == Point.Empty, "motion anchors oversized window to usable screen origin");

            var copyA = new PetMotion(); var copyB = new PetMotion();
            copyA.SetPosition(new Point(90, 90)); copyB.SetPosition(new Point(90, 90));
            bool deterministic = true;
            for (int i = 0; i < 600; i++)
            {
                Point cursor = new Point(400 + (i * 17) % 900, 250 + (i * 7) % 500);
                deterministic &= copyA.Step(cursor, size, normal, .016, i % 49 != 0) == copyB.Step(cursor, size, normal, .016, i % 49 != 0);
            }
            check(deterministic, "motion is deterministic for identical cursor timeline");
        }
        private static double Distance(Point first, Point second)
        {
            double dx = first.X - (double)second.X, dy = first.Y - (double)second.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }
        private static double DistanceFromRect(Point point, Rectangle rectangle)
        {
            double dx = point.X < rectangle.Left ? rectangle.Left - point.X : point.X > rectangle.Right ? point.X - rectangle.Right : 0;
            double dy = point.Y < rectangle.Top ? rectangle.Top - point.Y : point.Y > rectangle.Bottom ? point.Y - rectangle.Bottom : 0;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
