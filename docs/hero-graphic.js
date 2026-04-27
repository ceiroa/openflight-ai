document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("hero-flight-graph");
    if (!canvas) {
        return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
        return;
    }

    drawHeroGraph(canvas, context);
});

function drawHeroGraph(canvas, context) {
    const width = canvas.width;
    const height = canvas.height;

    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#020617");
    gradient.addColorStop(1, "#0f172a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "#38bdf8";
    context.setLineDash([8, 4]);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(100, 140);
    context.quadraticCurveTo(width / 2, 20, width - 100, 140);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#f1f5f9";
    context.beginPath();
    context.arc(100, 140, 5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(width - 100, 140, 5, 0, Math.PI * 2);
    context.fill();

    context.font = "bold 12px Inter, Segoe UI, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText("DEP", 90, 160);
    context.fillText("DEST", width - 115, 160);

    const planeX = width / 2;
    const planeY = 45;
    context.save();
    context.translate(planeX, planeY);
    context.rotate(-0.05);

    context.fillStyle = "#38bdf8";
    context.shadowBlur = 10;
    context.shadowColor = "#38bdf8";

    context.beginPath();
    context.ellipse(0, 0, 25, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(-5, 0);
    context.lineTo(-12, -25);
    context.lineTo(8, -25);
    context.lineTo(15, 0);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(-5, 0);
    context.lineTo(-12, 25);
    context.lineTo(8, 25);
    context.lineTo(15, 0);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(-18, 0);
    context.lineTo(-24, -10);
    context.lineTo(-20, -10);
    context.lineTo(-14, 0);
    context.fill();
    context.beginPath();
    context.moveTo(-18, 0);
    context.lineTo(-24, 10);
    context.lineTo(-20, 10);
    context.lineTo(-14, 0);
    context.fill();
    context.fillStyle = "#0ea5e9";
    context.beginPath();
    context.moveTo(-15, -2);
    context.lineTo(-26, -12);
    context.lineTo(-24, 0);
    context.fill();

    context.restore();
}
